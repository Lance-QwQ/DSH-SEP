// Private readback helper. Only an owner-exclusive, verified plan supplies paths.
import {constants} from 'node:fs';
import {lstat, open, realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const fail = code => { throw Object.assign(new Error(code), {code}); };
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = s => [s.dev,s.ino,s.size,s.mode,s.nlink,s.mtimeNs,s.ctimeNs].join(':');
const cancelled = signal => { if (signal?.aborted) fail('SEP_PROJECT_CANCELLED'); };
const validPath = path => typeof path === 'string' && path.length > 0 && path.length <= 2048 && !/[\\:\x00-\x1f\x7f]/u.test(path) && path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/u.test(p));
const metadata = row => row ? row.kind === 'file' ? {kind:'file',size:row.size,sha256:row.sha256} : {kind:'directory'} : null;

async function observedBytes(root, row, path, signal, code) {
  cancelled(signal);
  if (!row) return Buffer.alloc(0);
  const physical = join(root, path); let file;
  try {
    const before = await lstat(physical, {bigint:true});
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size !== BigInt(row.size) || await realpath(physical) !== physical) fail(code);
    file = await open(physical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const held = await file.stat({bigint:true}); if (identity(before) !== identity(held)) fail(code);
    const bytes = Buffer.alloc(row.size + 1); let count = 0;
    while (count < bytes.length) {
      cancelled(signal);
      const read = await file.read(bytes, count, bytes.length - count, count);
      if (!read.bytesRead) break; count += read.bytesRead;
    }
    if (count !== row.size || identity(held) !== identity(await file.stat({bigint:true})) || identity(held) !== identity(await lstat(physical,{bigint:true}))) fail(code);
    const value = bytes.subarray(0,count); if (hash(value) !== row.sha256) fail(code);
    cancelled(signal); return value;
  } catch (error) {
    if (error?.code === 'SEP_PROJECT_CANCELLED') throw error;
    fail(code);
  } finally { await file?.close(); }
}
function decoded(bytes) {
  if (bytes.includes(0)) return {reason:'binary'};
  try { return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)}; }
  catch { return {reason:'non-utf8'}; }
}
function lineDiff(before, after, limit) {
  const left = before === null ? [] : before.split('\n'), right = after === null ? [] : after.split('\n');
  let prefix = 0, suffix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  while (suffix < left.length-prefix && suffix < right.length-prefix && left[left.length-suffix-1] === right[right.length-suffix-1]) suffix++;
  if (prefix === left.length && prefix === right.length) return {hunks:[],truncated:false,lineCount:0,textBytes:0};
  const start = Math.max(0,prefix-3), end = Math.min(suffix,3), lines = [];
  for (let i=start;i<prefix;i++) lines.push({kind:'context',text:left[i]});
  for (let i=prefix;i<left.length-suffix;i++) lines.push({kind:'removed',text:left[i]});
  for (let i=prefix;i<right.length-suffix;i++) lines.push({kind:'added',text:right[i]});
  for (let i=0;i<end;i++) lines.push({kind:'context',text:left[left.length-suffix+i]});
  const kept = lines.slice(0,limit);
  return {hunks:kept.length?[{oldStart:start+1,newStart:start+1,lines:kept}]:[], truncated:kept.length<lines.length, lineCount:kept.length,textBytes:kept.reduce((n,line)=>n+Buffer.byteLength(line.text),0)};
}

export async function previewPlan({before, after, changes, signal}) {
  cancelled(signal);
  if (!Array.isArray(changes)) fail('SEP_MAC_WORKFLOW_INPUT');
  if (changes.length > 256) fail('SEP_MAC_WORKFLOW_REVIEW_LIMIT');
  const seen = new Set();
  for (const change of changes) {
    if (!change || !validPath(change.path) || !['created','deleted','modified'].includes(change.kind) || seen.has(change.path)) fail('SEP_MAC_WORKFLOW_INPUT');
    seen.add(change.path);
  }
  const oldRows = new Map(before.entries.map(row=>[row.path,row])), newRows = new Map(after.entries.map(row=>[row.path,row]));
  const output = [], diff = [], omitted = []; let bytesRead = 0, lines = 0, textBytes = 0;
  for (const change of changes) {
    cancelled(signal);
    const oldEntry = oldRows.get(change.path), nextEntry = newRows.get(change.path);
    if (!oldEntry && !nextEntry) fail('SEP_MAC_WORKFLOW_INPUT');
    if ([oldEntry,nextEntry].some(value=>value&&!['file','directory'].includes(value.kind))) fail('SEP_MAC_WORKFLOW_INPUT');
    output.push({...change,before:metadata(oldEntry),after:metadata(nextEntry)});
    const row = {path:change.path,hunks:[]}; diff.push(row);
    const old=oldEntry?.kind==='file'?oldEntry:undefined,next=nextEntry?.kind==='file'?nextEntry:undefined;
    if (!old&&!next) continue;
    for (const value of [old,next].filter(Boolean)) if (!Number.isSafeInteger(value.size)||value.size<0||!/^[a-f0-9]{64}$/.test(value.sha256??'')) fail('SEP_MAC_WORKFLOW_INPUT');
    const size = (old?.size??0)+(next?.size??0);
    let reason;
    if ((old?.size??0)>16384||(next?.size??0)>16384) reason='file-byte-limit';
    else if (bytesRead+size>65536) reason='total-byte-limit';
    else if (lines===400) reason='line-limit';
    if (reason) { omitted.push({path:change.path,reason}); continue; }
    const oldBytes = await observedBytes(before.path,old,change.path,signal,'SEP_PROJECT_BASELINE_CHANGED');
    const newBytes = await observedBytes(after.path,next,change.path,signal,'SEP_PROJECT_CANDIDATE_CHANGED');
    bytesRead += size;
    const left = decoded(oldBytes), right = decoded(newBytes);
    reason=left.reason??right.reason;
    if (reason) { omitted.push({path:change.path,reason}); continue; }
    const rendered = lineDiff(old?left.text:null,next?right.text:null,400-lines);
    row.hunks=rendered.hunks; lines+=rendered.lineCount; textBytes+=rendered.textBytes;
    if (rendered.truncated) omitted.push({path:change.path,reason:'line-limit'});
  }
  return {changes:output,diff,coverage:{changedCount:changes.length,listedCount:output.length,textComplete:omitted.length===0,bytesRead,textBytes,lineCount:lines,omitted}};
}
