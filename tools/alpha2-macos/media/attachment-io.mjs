import {createAttachmentTree,LIMITS} from './attachment-tree.mjs';
export {LIMITS};
const fail=code=>{throw Object.assign(Error(code),{code});};
const version=value=>typeof value==='string'&&value.length>0&&value.length<256;
function checked(input,metadata=false){
 const allowed=['path','expectedSha256','expectedVersion','expectedRootIdentity',...(metadata?['text']:[])];
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!allowed.includes(k))||!/^\d+:\d+$/.test(input.expectedRootIdentity??'')||!version(input.expectedVersion)||!(metadata&&input.expectedSha256==='absent'||/^[a-f0-9]{64}$/.test(input.expectedSha256??'')))fail('SEP_ATTACHMENT_CONFIG');
 if(metadata&&(typeof input.text!=='string'||!input.text.isWellFormed()||Buffer.byteLength(input.text)>1048576))fail('SEP_ATTACHMENT_METADATA_LIMIT');return input;
}
/** Trusted IO primitive, not user deletion authorization. The P2 authority,
 * two ownership leases and exact approved purge plan remain mandatory above. */
export function createMacAttachmentIO(config){
 const tree=createAttachmentTree(config);
 return Object.freeze({lockPath:tree.lockPath,
  inventory:root=>tree.tree(root),
  async checkDirectory(root){const held=await tree.directory(root,true);try{const s=await held.stat({bigint:true});return Object.freeze({rootIdentity:`${s.dev}:${s.ino}`,dev:String(s.dev),ino:String(s.ino)});}finally{await held.close();}},
  async removeFile(root,input){return tree.applyFile(root,{...checked(input),delete:true});},
  async publishMetadata(root,input){return tree.applyFile(root,checked(input,true));},
  syncDirectory:root=>tree.syncDirectory(root),
 });
}
