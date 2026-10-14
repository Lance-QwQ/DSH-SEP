import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=x=>createHash('sha256').update(x).digest('hex');
const files=[
 {source:'task-contract.mjs',target:'parser-contract.mjs',sha256:'2c9f2d201fb2695da26593e36fb2ab21019ea03f846bea3b6b3d0a371819c191',changes:[
  ['timeoutMs=30000,graceMs=200,maxOutputBytes=131072','timeoutMs=15000,graceMs=200,maxOutputBytes=12582912'],
  ['Buffer.byteLength(stdin)>65536','Buffer.byteLength(stdin)>12582912'],
  ['timeoutMs>300000','timeoutMs>15000'],['maxOutputBytes>1048576','maxOutputBytes>12582912'],
 ],all:[['SEP_MAC_TASK_','SEP_MAC_PARSER_'],["!['single','family'].includes(mode)","mode!=='single'"]]},
 {source:'task-worker.mjs',target:'parser-worker.mjs',sha256:'229fc6e191b487faebc989d7b809d2f39e5c12ffaf70c70a04542859df3263a6',changes:[
  ["from './task-contract.mjs'","from './parser-contract.mjs'"],['export async function createTaskWorker(','export async function createParserWorker('],
 ],all:[['SEP_MAC_TASK_','SEP_MAC_PARSER_']]},
];
for(const record of files){let source=await readFile(new URL('../task-sandbox/'+record.source,import.meta.url),'utf8');assert.equal(hash(source),record.sha256);for(const [before,after]of record.changes){assert.equal(source.split(before).length,2);source=source.replace(before,after);}record.replaceAll=[];for(const [before,after]of record.all){const count=source.split(before).length-1;assert(count>0);source=source.replaceAll(before,after);record.replaceAll.push({before,after,count});}delete record.all;record.resultSha256=hash(source);await writeFile(new URL(record.target,import.meta.url),source);}
await writeFile(new URL('origin.json',import.meta.url),JSON.stringify({schema:1,scope:'Trusted parser-only stdin/output limits, single-process policy; general task sources unchanged.',derivations:files},null,2)+'\n');
