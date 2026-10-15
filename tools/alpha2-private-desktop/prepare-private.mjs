import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const repo=process.env.SEP_SOURCE_REPO,phase=process.env.SEP_BUNDLE_TEST_ROOT;
let source=await readFile(join(repo,'tools/alpha2-desktop/private-profile.mjs'),'utf8');
source=source.replace("private-working-root/profile-","private-working-root/desktop-");
const anchor="  const worker=join(working,'private-worker.mjs');";
if(source.split(anchor).length!==2)throw Error('PRIVATE_PREPARE_ANCHOR');
source=source.slice(0,source.indexOf(anchor))+`
  await writeFile(join(working,'DESKTOP-PRIVATE-INPUT.json'),JSON.stringify({input,base:f.base,dirs:f.dirs,budgetPath:input.privateCheck.ledgerPath,copy,adapter,binding,fork},null,2)+'\\n');
  await writeFile(join(phase,'PRIVATE-DESKTOP-PREPARED-r1.json'),JSON.stringify({working,status:'prepared-not-run',planHash:fork.planHash},null,2)+'\\n',{flag:'wx'});
 }finally{if(!disposed)await close(f);}
 console.log(JSON.stringify({status:'prepared-not-run',working}));
}catch(error){await writeFile(join(working,'prepare-error.log'),error.stack??error.name);throw error;}
`;
const script=fileURLToPath(new URL('./generated-private-prepare.mjs',import.meta.url));await writeFile(script,source);
const child=spawn(process.execPath,[script],{env:process.env,stdio:'inherit',windowsHide:true});process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
