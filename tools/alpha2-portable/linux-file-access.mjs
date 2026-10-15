import {relative,isAbsolute} from 'node:path';
import {owned} from './bundle-modules.mjs';
import {load} from './host-modules.mjs';
const {sessionEvents}=await owned('modules/system-enhancement-package/src/session-events.js'),{delegationDepthOf}=await load('@deepseek-ai/dsh-subagent');
const fail=code=>{throw Object.assign(Error(code),{code});};
export const fileToken=ref=>'sep-attachment://'+String(ref.attachmentId).slice(7)+'/'+encodeURIComponent(ref.name);
export function projectFilePath(root,input){
 const rel=relative(root,input),match=/^files\/([a-f0-9]{2})\/([a-f0-9]{64})\/([^/]+)$/.exec(rel);if(!match||isAbsolute(rel)||match[1]!==match[2].slice(0,2))return;return fileToken({attachmentId:'sha256:'+match[2],name:match[3]});
}
export async function readSessionFile(ctx,source,{path,maxBytes=65536},exec){
 if(ctx.agents.get(exec.agent.id)!==exec.agent||exec.agent.session.header.cwd!==source)fail('SEP_LINUX_AGENT_SCOPE');if(delegationDepthOf(exec.agent)>0)fail('SEP_LINUX_CHILD_READONLY');
 if(typeof path!=='string'||!/^sep-attachment:\/\/[a-f0-9]{64}\//.test(path)||path.length>2048)fail('SEP_FILE_REFERENCE_INVALID');
 let ref;for(const e of sessionEvents(exec.agent.session)){if(e.type!=='user/message')continue;const message=e.data?.message??e.data;if(message?.source?.kind!=='user')continue;const content=message.content;if(!Array.isArray(content))continue;for(const b of content)if(b.type==='file'&&b.attachment&&fileToken(b.attachment)===path)ref=b.attachment;}
 if(!ref)fail('SEP_FILE_NOT_REFERENCED');
 // Do not expose a prefix until the native iterator has verified the WHOLE
 // object's hash and size. Retain only a bounded prefix, never the whole file.
 const parts=[],decoder=new TextDecoder('utf-8',{fatal:true});let held=0;try{for await(const chunk of ctx.get('attachments').readFileStream(ref,exec.signal)){try{if(chunk.includes(0))throw Error();decoder.decode(chunk,{stream:true});}catch{fail('SEP_FILE_NOT_TEXT');}if(held<maxBytes){const part=chunk.subarray(0,maxBytes-held);parts.push(Buffer.from(part));held+=part.length;}}try{decoder.decode();}catch{fail('SEP_FILE_NOT_TEXT');}}catch(error){if(typeof error?.code==='string'&&/^(?:ATTACHMENT|SEP)_[A-Z0-9_]+$/.test(error.code))fail(error.code);throw error;}
 const data=Buffer.concat(parts);let text;try{if(data.includes(0))throw Error();text=new TextDecoder('utf-8',{fatal:true}).decode(data,{stream:ref.bytes>maxBytes});}catch{fail('SEP_FILE_NOT_TEXT');}exec.signal.throwIfAborted();return {name:ref.name,bytes:ref.bytes,text,truncated:ref.bytes>maxBytes};
}
