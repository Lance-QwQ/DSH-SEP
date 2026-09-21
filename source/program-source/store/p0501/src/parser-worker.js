import { parentPort, workerData } from 'node:worker_threads';
import { fail } from './errors.js';
import { PARSER_VERSION } from './parsers.js';

async function docx(bytes, maxChars) {
  if (Buffer.from(bytes.subarray(0, 2)).toString() !== 'PK') fail('DAMAGED_DOCX');
  const { unzipSync } = await import('fflate');
  let entries = 0; let expanded = 0;
  const files = unzipSync(bytes, { filter(entry) {
    if (++entries > 512) fail('TOO_LARGE');
    if (entry.name !== 'word/document.xml') return false;
    expanded += entry.originalSize;
    if (!Number.isSafeInteger(entry.originalSize) || expanded > 2 * 1024 * 1024) fail('TOO_LARGE');
    return true;
  } });
  const body = files['word/document.xml'];
  if (!body) fail('DAMAGED_DOCX');
  if (body.length > 2 * 1024 * 1024) fail('TOO_LARGE');
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(body);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('UNSAFE_XML');
  const { XMLParser, XMLValidator } = await import('fast-xml-parser');
  if (XMLValidator.validate(xml) !== true) fail('DAMAGED_DOCX');
  const parsed = new XMLParser({ preserveOrder: true, ignoreAttributes: true, parseTagValue: false, trimValues: false }).parse(xml);
  const parts = []; let paragraph = 0; let total = 0;
  const textOf = (nodes, depth = 0) => {
    if (depth > 128) fail('TOO_DEEP');
    return nodes.map(node => Object.entries(node).map(([tag, value]) => tag === '#text' ? String(value) : tag === 'w:tab' ? '\t' : tag === 'w:br' ? '\n' : Array.isArray(value) ? textOf(value, depth + 1) : '').join('')).join('');
  };
  function visit(nodes, depth = 0) {
    if (depth > 128) fail('TOO_DEEP');
    for (const node of nodes) for (const [tag, value] of Object.entries(node)) {
      if (tag === 'w:p') {
        paragraph++; const text = textOf(value).trim(); total += text.length;
        if (total > maxChars) fail('TOO_LARGE');
        for (let i = 0; i < text.length; i += 1200) parts.push({ text: text.slice(i, i + 1200), locator: { paragraph } });
      } else if (Array.isArray(value)) visit(value, depth + 1);
    }
  }
  visit(parsed);
  if (!parts.length) fail('NO_TEXT');
  return { parts, parserVersion: PARSER_VERSION, warnings: ['DOCX main body only; embedded images, headers and footers are not extracted.'] };
}

async function pdf(bytes, maxChars) {
  if (!Buffer.from(bytes.subarray(0, 8)).toString().startsWith('%PDF-')) fail('DAMAGED_PDF');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWorkerFetch: false, enableXfa: false, useSystemFonts: false, disableFontFace: true, verbosity: 0, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages > 200) fail('TOO_MANY_PAGES');
    const parts = []; const emptyPages = []; let total = 0;
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      total += text.length;
      if (total > maxChars) fail('TOO_LARGE');
      if (!text) emptyPages.push(pageNo);
      for (let i = 0; i < text.length; i += 1200) parts.push({ text: text.slice(i, i + 1200), locator: { page: pageNo } });
      page.cleanup();
    }
    if (!parts.length) fail('NEEDS_OCR_OR_EMPTY_PDF');
    return { parts, parserVersion: PARSER_VERSION, warnings: emptyPages.length ? [`No text on pages ${emptyPages.join(',')}; these pages may require OCR.`] : [] };
  } catch (error) {
    if (error.name === 'PasswordException') fail('PASSWORD_REQUIRED');
    throw error;
  } finally { await task.destroy(); }
}

async function image(bytes) {
  const buffer = Buffer.from(bytes); let mime;
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mime = 'image/jpeg';
  else if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') mime = 'image/webp';
  else fail('UNSUPPORTED_IMAGE');
  const dimensions=(width,height)=>{if(!width||!height)fail('DAMAGED_IMAGE');if(width>8192||height>8192||width*height>16000000)fail('TOO_LARGE');};
  // Bound decoded allocations from headers before entering the native decoder.
  if(mime==='image/png'){
    if(buffer.length<24||buffer.subarray(12,16).toString()!=='IHDR')fail('DAMAGED_IMAGE');
    dimensions(buffer.readUInt32BE(16),buffer.readUInt32BE(20));
    for(let at=8;at+12<=buffer.length;){const size=buffer.readUInt32BE(at);if(buffer.subarray(at+4,at+8).toString()==='acTL')fail('ANIMATED_IMAGE_UNSUPPORTED');at+=12+size;}
  }else if(mime==='image/jpeg'){
    let found=false;
    for(let at=2;at+4<=buffer.length;){
      if(buffer[at++]!==255)fail('DAMAGED_IMAGE');while(buffer[at]===255)at++;
      const marker=buffer[at++];if(marker===217||marker===218)break;
      if(marker>=208&&marker<=215)continue;
      if(at+2>buffer.length)fail('DAMAGED_IMAGE');const size=buffer.readUInt16BE(at);
      if(size<2||at+size>buffer.length)fail('DAMAGED_IMAGE');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
        if(size<8)fail('DAMAGED_IMAGE');dimensions(buffer.readUInt16BE(at+5),buffer.readUInt16BE(at+3));found=true;
      }
      at+=size;
    }
    if(!found)fail('DAMAGED_IMAGE');
  }else{
    if(buffer.length<20||buffer.readUInt32LE(4)+8!==buffer.length)fail('DAMAGED_IMAGE');let found=false;
    // RIFF dimensions: https://developers.google.com/speed/webp/docs/riff_container
    for(let at=12;at+8<=buffer.length;){
      const tag=buffer.subarray(at,at+4).toString();const size=buffer.readUInt32LE(at+4);const data=at+8;
      if(data+size>buffer.length)fail('DAMAGED_IMAGE');
      if(tag==='ANIM'||tag==='ANMF')fail('ANIMATED_IMAGE_UNSUPPORTED');
      if(tag==='VP8X'){
        if(size<10)fail('DAMAGED_IMAGE');if(buffer[data]&2)fail('ANIMATED_IMAGE_UNSUPPORTED');
        dimensions(1+buffer.readUIntLE(data+4,3),1+buffer.readUIntLE(data+7,3));found=true;
      }else if(tag==='VP8 '){
        if(size<10||!buffer.subarray(data+3,data+6).equals(Buffer.from([157,1,42])))fail('DAMAGED_IMAGE');
        dimensions(buffer.readUInt16LE(data+6)&16383,buffer.readUInt16LE(data+8)&16383);found=true;
      }else if(tag==='VP8L'){
        if(size<5||buffer[data]!==47)fail('DAMAGED_IMAGE');const bits=buffer.readUInt32LE(data+1);
        dimensions(1+(bits&16383),1+((bits>>>14)&16383));found=true;
      }
      at=data+size+(size%2);
    }
    if(!found)fail('DAMAGED_IMAGE');
  }
  const { loadImage } = await import('@napi-rs/canvas');
  let decoded;
  try { decoded = await loadImage(buffer); } catch { fail('DAMAGED_IMAGE'); }
  if (!decoded.width || !decoded.height) fail('DAMAGED_IMAGE');
  if (decoded.width > 8192 || decoded.height > 8192 || decoded.width * decoded.height > 16000000) fail('TOO_LARGE');
  return { mime, width: decoded.width, height: decoded.height, decoderVersion: 'canvas-1.0.8' };
}

try {
  const { kind, bytes, options } = workerData;
  const value = kind === 'image' ? await image(bytes) : options.extension === '.docx' ? await docx(bytes, options.maxChars) : await pdf(bytes, options.maxChars);
  parentPort.postMessage({ value });
} catch (error) {
  parentPort.postMessage({ error: error.code && typeof error.code === 'string' ? error.code : workerData.kind === 'image' ? 'DAMAGED_IMAGE' : 'DAMAGED_DOCUMENT' });
}
