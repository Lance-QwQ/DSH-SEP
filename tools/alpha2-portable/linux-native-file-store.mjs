// Two declared transformations of the frozen official attachment provider.
// No hard-link alias survives publication; streaming/backpressure/fsync stay native.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {host} from './host-modules.mjs';
import {hash,fail} from './project-tree.mjs';
const require=createRequire(host+'/package.json'),filename=require.resolve('@deepseek-ai/dsh-attachment-local');
export const origin=Object.freeze({package:'@deepseek-ai/dsh-attachment-local',sha256:'cd39685581b4573a453c6126f8ce73da0bf1257c378827ebb431d6d4064f7662',transformations:[
 ['await link(source, target);','await publishImmutableObjectStream(root, createReadStream(source, {highWaterMark:65536}), actual => { if (actual !== sha256) throw new AttachmentError("Stored attachment failed integrity verification.", "ATTACHMENT_CORRUPT"); return target; });'],
 ['createLazyRequire("sharp", import.meta.url)','createLazyRequire("sharp", '+JSON.stringify(pathToFileURL(filename).href)+')'],
]});
let source=await readFile(filename,'utf8');if(hash(source)!==origin.sha256)fail('SEP_LINUX_FILE_ORIGIN_CHANGED');for(const [before,after]of origin.transformations){if(source.split(before).length!==2)fail('SEP_LINUX_FILE_TRANSFORM');source=source.replace(before,after);}
source=source.replace(/from (["'])([^"']+)\1/g,(_all,q,name)=>'from '+q+(name.startsWith('node:')?name:pathToFileURL(require.resolve(name)).href)+q);
export const transformedSha256=hash(source);
export const {LocalAttachmentStore}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
