// Trusted offline operator entry. No Agent tool and no implicit confirmation.
import {lstat,readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {prepareAttachmentPurge,applyAttachmentPurge} from './attachment-maintenance.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
try{
 const [action,storageRoot,projectId,planFile,confirm,...extra]=process.argv.slice(2);
 if(extra.length||!['plan','apply'].includes(action)||!storageRoot||!isAbsolute(storageRoot)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId??'')||action==='plan'&&(planFile!==undefined||confirm!==undefined)||action==='apply'&&(!planFile||!confirm))fail('SEP_ATTACHMENT_CLI_INPUT');
 const selected={storageRoot,projectId};let result;
 if(action==='plan')result=await prepareAttachmentPurge(selected);
 else{
  const stat=await lstat(planFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1024*1024)fail('SEP_ATTACHMENT_CLI_INPUT');
  const plan=JSON.parse(await readFile(planFile,'utf8'));result=await applyAttachmentPurge({...selected,plan,confirm});
 }
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){
 const code=/^[A-Z][A-Z0-9_]{1,63}$/.test(error.code??'')?error.code:'SEP_ATTACHMENT_CLI_FAILED';
 process.stderr.write(JSON.stringify({status:'blocked',code})+'\n');process.exitCode=2;
}
