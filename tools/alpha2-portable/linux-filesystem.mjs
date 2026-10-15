// UI reads only. Model mutations use the namespace tools, never this facade.
import {load} from './host-modules.mjs';
import {resolve,relative,isAbsolute,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {FileSystem,FsError}=await load('@deepseek-ai/dsh-fs');
const deny=()=>{throw new FsError('SEP controlled UI is read-only','FS_SANDBOX_DENIED');};
export class LinuxReadOnlyFiles extends FileSystem{
 constructor(ctx,{source,view}){super(ctx);this.source=source;this.view=view;this.targets=new WeakMap();}
 get sandboxMode(){return 'read-only';}
 async resolve(input,opts){opts?.signal?.throwIfAborted();if(typeof input!=='string'||input.includes('\0')||input.includes('\\'))deny();const displayPath=resolve(opts?.cwd??this.source,input),part=relative(this.source,displayPath);if(part==='..'||part.startsWith('../')||isAbsolute(part))deny();const view=await this.view(),target=Object.freeze({targetKey:'sep-linux:'+displayPath,displayPath});this.targets.set(target,{part,view});return target;}
 owned(target){const saved=this.targets.get(target);if(!saved)deny();return saved;}
 bindAttachmentPaths(project){if(this.attachmentPaths)deny();this.attachmentPaths=project;return()=>{if(this.attachmentPaths===project)this.attachmentPaths=undefined;};}
 processPath(target){this.owned(target);return target.displayPath;}
 processPathFromHostPath(input){const part=relative(this.source,resolve(input));return part!=='..'&&!part.startsWith('../')&&!isAbsolute(part)?resolve(input):this.attachmentPaths?.(input);}
 fileUrl(target){return pathToFileURL(this.processPath(target)).href;}
 contains(parent,child){const part=relative(this.processPath(parent),this.processPath(child));return part===''||part!=='..'&&!part.startsWith('../')&&!isAbsolute(part);}
 async fresh(target,signal){signal?.throwIfAborted();const saved=this.owned(target),view=await this.view();if(saved.view.version!==view.version)throw new FsError('view changed','FS_STALE_VERSION');return saved;}
 async stat(target,signal){const {part,view}=await this.fresh(target,signal);if(!part)return {type:'directory',version:view.version};const row=view.entries.find(x=>x.path===part);return row?{type:row.kind==='directory'?'directory':'file',version:view.version+':'+part,...row.kind==='file'?{size:row.size}:{}}:undefined;}
 async lstat(input,opts,signal){return this.stat(await this.resolve(input,opts),signal);}
 async listDir(target,signal){const {part,view}=await this.fresh(target,signal);const info=await this.stat(target,signal);if(info?.type!=='directory')throw new FsError('not a directory','FS_NOT_DIRECTORY');const rows=[];for(const row of view.entries){if(dirname(row.path)===(part||'.')){const child=await this.resolve(join(target.displayPath,basename(row.path)));rows.push({name:basename(row.path),type:row.kind==='directory'?'directory':'file',target:child,...row.kind==='file'?{size:row.size}:{}});}}return rows;}
 async readBytes(target,signal,maxBytes){const {part,view}=await this.fresh(target,signal),row=view.entries.find(x=>x.path===part);if(row?.kind!=='file')throw new FsError('not a regular file','FS_NOT_REGULAR_FILE');if(!Number.isSafeInteger(maxBytes)||maxBytes<0||row.size>Math.min(maxBytes,4194304))throw new FsError('bounded read','FS_TOO_LARGE');const file=await open(join(view.path,part),constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await file.stat();if(!info.isFile()||info.nlink!==1||info.size!==row.size)deny();const bytes=await file.readFile();if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new FsError('view changed','FS_STALE_VERSION');signal?.throwIfAborted();return bytes;}finally{await file.close();}}
 async readText(target,signal){const bytes=await this.readBytes(target,signal,4194304);try{if(bytes.includes(0))throw Error();return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new FsError('not UTF8 text','FS_NOT_TEXT');}}
 async streamText(target,signal){const text=await this.readText(target,signal);return (async function*(){signal?.throwIfAborted();yield text;})();}
 async readByteRange(target,range,signal){if(!Number.isSafeInteger(range.offset)||range.offset<0||!Number.isSafeInteger(range.length)||range.length<0||range.length>4194304)throw new FsError('bounded range','FS_TOO_LARGE');return (await this.readBytes(target,signal,4194304)).subarray(range.offset,range.offset+range.length);}
 async watch(){throw new FsError('live UI watch unavailable','FS_IO_ERROR');}
 async writeText(){deny();}async editText(){deny();}
}
