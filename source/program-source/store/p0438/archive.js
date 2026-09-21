import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import { ConversionError } from './errors.js';
import { setImmediate as yieldToLoop } from 'node:timers/promises';
import { SaxesParser } from 'saxes';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let value = n; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); crcTable[n] = value >>> 0; }
function bad(message) { throw new ConversionError('invalid-document', message); }
function aborted(signal) { if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled.', 'AbortError'); }
function xmlText(bytes) {
  let text;
  try { text = bytes[0] === 0xff && bytes[1] === 0xfe ? new TextDecoder('utf-16le', { fatal: true }).decode(bytes) : bytes[0] === 0xfe && bytes[1] === 0xff ? new TextDecoder('utf-16be', { fatal: true }).decode(bytes) : new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { bad('Relationship XML encoding is invalid.'); }
  if (text.includes('\0')) bad('Relationship XML requires UTF-8 or BOM-marked UTF-16.');
  return text;
}

function validateRelationships(xml) {
  const namespaces = new Set(['http://schemas.openxmlformats.org/package/2006/relationships', 'http://purl.oclc.org/ooxml/package/relationships']);
  const hyperlinkTypes = new Set(['http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', 'http://purl.oclc.org/ooxml/officeDocument/relationships/hyperlink']);
  const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });
  const ids = new Set(); let depth = 0;
  parser.on('error', () => bad('Relationship XML is malformed.'));
  parser.on('doctype', () => bad('Relationship XML DTDs are not accepted.'));
  parser.on('xmldecl', value => { if (value.version !== '1.0') bad('Only XML 1.0 relationships are accepted.'); });
  const whitespace = value => { if (value.trim()) bad('Unexpected relationship text.'); };
  parser.on('text', whitespace); parser.on('cdata', whitespace);
  parser.on('opentag', node => {
    depth++;
    if (!namespaces.has(node.uri) || (depth === 1 ? node.local !== 'Relationships' : depth !== 2 || node.local !== 'Relationship')) bad('Unexpected relationship XML element.');
    const attributes = {};
    for (const attr of Object.values(node.attributes)) {
      if (attr.uri === 'http://www.w3.org/2000/xmlns/') continue;
      if (attr.uri || depth !== 2 || !['Id', 'Type', 'Target', 'TargetMode'].includes(attr.local)) bad('Unexpected relationship attribute.');
      attributes[attr.local] = attr.value;
    }
    if (depth === 1) return;
    const { Id: id, Type: type, Target: target, TargetMode: mode = 'Internal' } = attributes;
    if (!id || ids.has(id) || !type || !target || target.trim() !== target || !['Internal', 'External'].includes(mode) || /[\u0000-\u001f\u007f\\]/u.test(target)) bad('Invalid relationship attributes.');
    ids.add(id);
    if (mode === 'Internal') { if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) bad('External target cannot be declared internal.'); return; }
    if (!hyperlinkTypes.has(type) || /\s/u.test(target)) bad('External resource relationships are not accepted.');
    let uri; try { uri = new URL(target); } catch { bad('The hyperlink URI is invalid.'); }
    if (!['http:', 'https:', 'mailto:'].includes(uri.protocol) || uri.username || uri.password || (uri.protocol === 'mailto:' ? !uri.pathname : !uri.hostname)) bad('The hyperlink URI is not permitted.');
  });
  parser.on('closetag', () => { depth--; });
  parser.write(xml).close();
}

/** Validate the complete ZIP envelope and each decoded entry, without extracting paths. */
export async function validateArchive(bytes, suffix, limits, signal) {
  aborted(signal);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) bad('The Office archive is truncated or invalid.');
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralStart = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0 || count !== bytes.readUInt16LE(end + 8) || count === 65535 || centralSize === 0xffffffff || centralStart === 0xffffffff) bad('Split and ZIP64 archives are not supported.');
  if (count > limits.maxArchiveEntries) throw new ConversionError('input-too-large', 'The archive has too many entries.');
  if (centralStart + centralSize !== end) bad('The central directory bounds are invalid.');
  const names = new Set(), spans = [], entries = []; let cursor = centralStart, total = 0;
  for (let index = 0; index < count; index++) {
    aborted(signal);
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) bad('A central entry is incomplete.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24), nameSize = bytes.readUInt16LE(cursor + 28), extraSize = bytes.readUInt16LE(cursor + 30), commentSize = bytes.readUInt16LE(cursor + 32), disk = bytes.readUInt16LE(cursor + 34), attrs = bytes.readUInt32LE(cursor + 38), local = bytes.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameSize + extraSize + commentSize > end) bad('A central entry is out of bounds.');
    if (flags & 1 || flags & 0x40 || ![0, 8].includes(method) || disk || size === 0xffffffff || compressed === 0xffffffff || local === 0xffffffff || ((attrs >>> 16) & 0xf000) === 0xa000) bad('Encrypted, linked, ZIP64, and unsupported compressed entries are not accepted.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameSize); let name;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes); } catch { bad('Archive entry names must be UTF-8 or ASCII.'); }
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.includes(':') || name.split('/').some(part => part === '..' || part === '.') || names.has(name.toLowerCase())) bad('Unsafe or duplicate archive entry.');
    names.add(name.toLowerCase());
    if (/vbaproject|vbasignature/i.test(name)) bad('Embedded VBA projects are not accepted.');
    total += size; if (total > limits.maxUncompressedBytes) throw new ConversionError('input-too-large', 'Uncompressed archive bytes exceed the limit.');
    if (local + 30 > centralStart || bytes.readUInt32LE(local) !== 0x04034b50) bad('A local entry is out of bounds.');
    const localNameSize = bytes.readUInt16LE(local + 26), localExtraSize = bytes.readUInt16LE(local + 28), dataStart = local + 30 + localNameSize + localExtraSize, dataEnd = dataStart + compressed;
    if (dataEnd > centralStart || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || !bytes.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes)) bad('Local and central entries disagree.');
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== size)) bad('Local and central entry sizes disagree.');
    spans.push([local, dataEnd]); entries.push({ name, method, crc, size, data: bytes.subarray(dataStart, dataEnd) });
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  if (cursor !== end) bad('The central directory count is inconsistent.');
  spans.sort((a, b) => a[0] - b[0]); for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) bad('Archive entries overlap.');
  const main = suffix === '.docx' ? 'word/document.xml' : suffix === '.xlsx' ? 'xl/workbook.xml' : 'ppt/presentation.xml';
  if (!names.has('[content_types].xml') || !names.has(main)) bad('Required OOXML parts are missing.');
  for (const entry of entries) {
    aborted(signal);
    let length = 0, checksum = 0xffffffff; const fragments = [], inspect = /\.rels$/i.test(entry.name);
    if (inspect && entry.size > 4 * 1024 * 1024) bad('Relationship XML exceeds the inspection limit.');
    const iterable = entry.method === 8 ? Readable.from([entry.data]).pipe(createInflateRaw({ chunkSize: 32768 })) : Readable.from((function* () { for (let start = 0; start < entry.data.length; start += 32768) yield entry.data.subarray(start, start + 32768); })());
    const onAbort = () => iterable.destroy(signal.reason ?? new DOMException('Cancelled.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      for await (const chunk of iterable) {
        aborted(signal); length += chunk.length; if (length > entry.size) bad('Decoded bytes exceed the archive declaration.');
        for (const value of chunk) checksum = (checksum >>> 8) ^ crcTable[(checksum ^ value) & 255];
        if (inspect) fragments.push(chunk);
        await yieldToLoop();
      }
    } catch (cause) { if (signal.aborted) throw signal.reason; if (cause instanceof ConversionError) throw cause; throw new ConversionError('invalid-document', 'Archive decompression failed.', { cause }); }
    finally { signal.removeEventListener('abort', onAbort); iterable.destroy(); }
    if (length !== entry.size || ((checksum ^ 0xffffffff) >>> 0) !== entry.crc) bad('Archive length or checksum is invalid.');
    if (inspect) {
      validateRelationships(xmlText(Buffer.concat(fragments)));
    }
  }
}
