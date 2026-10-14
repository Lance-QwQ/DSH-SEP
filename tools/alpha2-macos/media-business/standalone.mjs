import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
const file=new URL('../business/standalone.mjs',import.meta.url);let source=await readFile(file,'utf8');
export const origin=Object.freeze({source:'../business/standalone.mjs',sha256:'e4ad150db13d7cf173826923f2d047c61c8762ff959b403eeee73fe01e7911c6'});
if(hash(source)!==origin.sha256)throw Error('SEP_MAC_MEDIA_STANDALONE_ORIGIN');
source=source.replace(/(?:from |import\()'([^']+)'/g,(all,path)=>{if(!path.startsWith('.'))return all;const target=path==='./profile-layout.mjs'?new URL(path,import.meta.url):new URL(path,file);return all.replace(path,target.href);});
export const transformedSha256=hash(source);
export const {openMacBusiness}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
