import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fail=code=>{throw Object.assign(Error(code),{code});};
export async function frozen(path,sha256){const source=await readFile(path,'utf8');if(hash(source)!==sha256)fail('SEP_MAC_DOCUMENT_ORIGIN_CHANGED');return source;}
export function transform(source,steps){
 const inputSha256=hash(source),changes=[];
 for(const {before,after,count=1}of steps){if(typeof before!=='string'||!before.length||source.split(before).length-1!==count)fail('SEP_MAC_DOCUMENT_TRANSFORM');const prior=hash(source);source=source.split(before).join(after);changes.push({beforeSha256:hash(before),afterSha256:hash(after),occurrences:count,inputSha256:prior,outputSha256:hash(source)});}
 return {source,receipt:Object.freeze({inputSha256,changes,outputSha256:hash(source)})};
}
// A cut is still byte-bound by both the immutable full input and the recorded
// before/after span hashes. Ambiguous anchors refuse instead of choosing a hit.
export function cut(source,start,end){if(source.split(start).length!==2||source.split(end).length!==2)fail('SEP_MAC_DOCUMENT_TRANSFORM');const begin=source.indexOf(start),finish=source.indexOf(end,begin);if(finish<begin)fail('SEP_MAC_DOCUMENT_TRANSFORM');return source.slice(begin,finish);}
export async function evaluate(source,filename){
 const require=createRequire(filename),absolute=source.replace(/^((?:import|export)\b[^\n;]*?from )'([^']+)'/gm,(all,prefix,name)=>name.startsWith('node:')||name.startsWith('file:')?all:prefix+"'"+pathToFileURL(require.resolve(name)).href+"'");
 return import('data:text/javascript;base64,'+Buffer.from(absolute).toString('base64'));
}
