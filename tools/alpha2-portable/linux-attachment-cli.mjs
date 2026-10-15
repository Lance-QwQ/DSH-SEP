// Trusted stopped-instance operator. This CLI is never a model tool.
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {prepareAttachmentPurge,applyAttachmentPurge} from './linux-attachment-maintenance.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const version=s=>[s.dev,s.ino,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
try{
 const [action,storageRoot,projectId,planFile,confirm,...extra]=process.argv.slice(2);
 if(extra.length||!['plan','apply'].includes(action)||!storageRoot||!isAbsolute(storageRoot)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId??'')||action==='plan'&&(planFile!==undefined||confirm!==undefined)||action==='apply'&&(!planFile||!confirm))fail('SEP_ATTACHMENT_CLI_INPUT');
 const selected={storageRoot,projectId};let result;
 if(action==='plan')result=await prepareAttachmentPurge(selected);
 else{
  const stat=await lstat(planFile,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.uid!==BigInt(process.getuid())||(stat.mode&0o077n)!==0n||stat.size>1024n*1024n)fail('SEP_ATTACHMENT_CLI_INPUT');
  const held=await open(planFile,constants.O_RDONLY|constants.O_NOFOLLOW);let plan;
  try{if(version(stat)!==version(await held.stat({bigint:true})))fail('SEP_ATTACHMENT_CLI_INPUT');plan=JSON.parse(await held.readFile('utf8'));if(version(stat)!==version(await held.stat({bigint:true}))||version(stat)!==version(await lstat(planFile,{bigint:true})))fail('SEP_ATTACHMENT_CLI_INPUT');}finally{await held.close();}
  result=await applyAttachmentPurge({...selected,plan,confirm});
 }
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){const code=/^[A-Z][A-Z0-9_]{1,63}$/.test(error.code??'')?error.code:'SEP_ATTACHMENT_CLI_FAILED';process.stderr.write(JSON.stringify({status:'blocked',code})+'\n');process.exitCode=2;}
