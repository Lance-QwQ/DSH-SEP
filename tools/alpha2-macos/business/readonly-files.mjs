import {load} from './host-modules.mjs';
import {resolve,relative,isAbsolute,dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {boundedRead} from './bounded-read.mjs';
const {FileSystem,FsError}=await load('@deepseek-ai/dsh-fs');
const deny=()=>{throw new FsError('SEP controlled UI is read-only','FS_SANDBOX_DENIED');};
export class MacReadOnlyFiles extends FileSystem{
 constructor(ctx,{source,withView}){super(ctx);this.source=source;this.withView=withView;this.targets=new WeakMap();}
 get sandboxMode(){return 'read-only';}
 async resolve(input,opts){opts?.signal?.throwIfAborted();if(typeof input!=='string'||input.includes('\0')||input.includes('\\'))deny();const displayPath=resolve(opts?.cwd??this.source,input),part=relative(this.source,displayPath);if(part==='..'||part.startsWith('../')||isAbsolute(part))deny();return this.withView(view=>{const target=Object.freeze({targetKey:'sep-mac:'+displayPath,displayPath});this.targets.set(target,{part,version:view.version});return target;});}
 processPath(target){if(!this.targets.has(target))deny();return target.displayPath;}
 fileUrl(target){return pathToFileURL(this.processPath(target)).href;}
 contains(a,b){this.processPath(a);this.processPath(b);const r=relative(a.displayPath,b.displayPath);return !r||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);}
 access(target,signal,work){signal?.throwIfAborted();const saved=this.targets.get(target);if(!saved)deny();return this.withView(async view=>{if(view.version!==saved.version)throw new FsError('view changed','FS_STALE_VERSION');return work(view,saved.part);});}
 stat(target,signal){return this.access(target,signal,(view,part)=>{const row=part?view.entries.find(e=>e.path===part):{kind:'directory'};return row?{type:row.kind==='file'?'file':'directory',size:row.size,version:row.sha256??view.version}:undefined;});}
 async lstat(input,opts,signal){return this.stat(await this.resolve(input,{...opts,signal}),signal);}
 listDir(target,signal){return this.access(target,signal,async(view,part)=>{const rows=view.entries.filter(row=>dirname(row.path)===(part||'.'));return rows.map(row=>{const displayPath=join(target.displayPath,basename(row.path)),item=Object.freeze({targetKey:'sep-mac:'+displayPath,displayPath});this.targets.set(item,{part:row.path,version:view.version});return {name:basename(row.path),type:row.kind==='file'?'file':'directory',target:item};});});}
 readBytes(target,signal,maxBytes=4194304){return this.access(target,signal,async(view,part)=>{const row=view.entries.find(e=>e.path===part);if(row?.kind!=='file')throw new FsError('not a file','FS_NOT_REGULAR_FILE');if(!Number.isSafeInteger(maxBytes)||maxBytes<0||row.size>Math.min(maxBytes,4194304))throw new FsError('bounded read','FS_TOO_LARGE');return boundedRead(join(view.path,part),{maxBytes:Math.min(maxBytes,4194304),sha256:row.sha256,signal});});}
 async readText(target,signal){const bytes=await this.readBytes(target,signal);try{if(bytes.includes(0))throw Error();return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new FsError('not UTF8 text','FS_NOT_TEXT');}}
 async streamText(target,signal){const text=await this.readText(target,signal);return(async function*(){signal?.throwIfAborted();yield text;})();}
 async readByteRange(target,range,signal){if(!Number.isSafeInteger(range.offset)||range.offset<0||!Number.isSafeInteger(range.length)||range.length<0||range.length>4194304)throw new FsError('bounded range','FS_TOO_LARGE');return(await this.readBytes(target,signal)).subarray(range.offset,range.offset+range.length);}
 async watch(){throw new FsError('live UI watch unavailable','FS_IO_ERROR');}
 async writeText(){deny();}async editText(){deny();}
}
