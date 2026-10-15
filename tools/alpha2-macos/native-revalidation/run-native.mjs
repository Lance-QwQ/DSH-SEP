// Native-only regression runner. No platform override, install, package or upload.
import {mkdir,readFile,writeFile,realpath,lstat,stat} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyTap,parseDfVolume,verifyVolumeBinding} from './runner-contract.mjs';
import {verifyWorkflowOrigin} from './workflow-origin.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});},sha=x=>createHash('sha256').update(x).digest('hex');
if(process.platform!=='darwin'||process.arch!=='arm64'){console.log(JSON.stringify({status:'not_run',code:'NATIVE_MAC_REQUIRED',platform:process.platform,arch:process.arch}));process.exit(78);}
const source=await realpath(fileURLToPath(new URL('../',import.meta.url))),root=process.argv[2];
if(process.argv.length!==3||!root||resolve(root)!==root||!process.env.RUNNER_TEMP)fail('SEP_NATIVE_FRESH_ROOT_REQUIRED');
const temp=await realpath(process.env.RUNNER_TEMP);if(dirname(root)!==temp)fail('SEP_NATIVE_RUNNER_TEMP_REQUIRED');
await mkdir(root,{mode:0o700});if(await realpath(root)!==root)fail('SEP_NATIVE_ROOT_ALIAS');
const result={schema:1,status:'fail',platform:process.platform,arch:process.arch,node:process.version,sourceCommit:process.env.GITHUB_SHA??null,scope:'native APFS helper/Profile/transaction/workflow regression plus separately labelled portable business/origin checks',runs:[],groups:[],nativeDesktop:'not_run',newInstaller:'not_run',fullMacCertification:'blocked'};
const json=(name,value)=>writeFile(join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
async function run(name,exe,args,{env={},input,timeout=180000}={}){
 const r=spawnSync(exe,args,{cwd:source,env:{...process.env,...env},input,encoding:'utf8',timeout,maxBuffer:32*1024*1024,killSignal:'SIGKILL'});
 const stdout=r.stdout??'',stderr=r.stderr??'';await writeFile(join(root,name+'.stdout.log'),stdout,{flag:'wx',mode:0o600});await writeFile(join(root,name+'.stderr.log'),stderr,{flag:'wx',mode:0o600});
 const row={name,executable:exe,args,exit:r.status,signal:r.signal,error:r.error?.code??null,stdoutSha256:sha(stdout),stderrSha256:sha(stderr),status:r.status===0&&!r.error?'pass':'fail'};result.runs.push(row);
 if(row.status!=='pass')fail('SEP_NATIVE_COMMAND_FAILED');return {stdout,stderr,row};
}
async function verifyInputs(){
 const bytes=await readFile(new URL('./INPUTS.json',import.meta.url)),manifest=JSON.parse(bytes);if(manifest.schema!==1||!Array.isArray(manifest.inputs))fail('SEP_NATIVE_INPUTS');
 const seen=new Set();for(const item of manifest.inputs){if(typeof item.path!=='string'||item.path.startsWith('/')||item.path.split('/').some(x=>!x||x==='.'||x==='..')||seen.has(item.path))fail('SEP_NATIVE_INPUTS');seen.add(item.path);const target=join(source,item.path),s=await lstat(target);if(!s.isFile()||s.isSymbolicLink())fail('SEP_NATIVE_INPUT_CHANGED');const body=await readFile(target);if(body.length!==item.bytes||sha(body)!==item.sha256)fail('SEP_NATIVE_INPUT_CHANGED');}
 return {manifestSha256:sha(bytes),verifiedFiles:seen.size,inputs:manifest.inputs};
}
const env={SEP_APFS_TEST_ROOT:join(root,'tree'),SEP_MAC_PROFILE_TEST_ROOT:join(root,'profile'),SEP_MAC_TRANSACTION_TEST_ROOT:join(root,'transactions'),SEP_MAC_ATTACHMENT_TEST_ROOT:join(root,'attachments'),SEP_MAC_LOW_TEST_ROOT:join(root,'business'),SEP_DOCUMENT_TEST_ROOT:join(root,'origin-import'),SEP_MAC_WORKFLOW_UNIT_ROOT:join(root,'workflow-unit'),SEP_MAC_WORKFLOW_TEST_ROOT:join(root,'workflow'),SEP_MAC_LOW_REPOSITORY:resolve(source,'../..')};
async function group(name,files,expected,scope,flags=[]){
 try{const r=await run(name,process.execPath,[...flags,'--test','--test-reporter=tap','--test-concurrency=1','--test-timeout=60000',...files.map(x=>join(source,x))],{env,timeout:300000});const counts=verifyTap(r.stdout,expected);result.groups.push({name,status:'pass',scope,...counts});}
 catch(e){result.groups.push({name,status:'fail',scope,expected,code:e.code??'UNCLASSIFIED'});}
}
try{
 if(process.version!=='v24.21.0')fail('SEP_NATIVE_NODE_VERSION');
 result.inputs=await verifyInputs();await json('INPUTS-VERIFIED.json',result.inputs);result.workflowOrigin=await verifyWorkflowOrigin();
 result.os=(await run('system-version','/usr/bin/sw_vers',['-productVersion'])).stdout.trim();if(!/^15\./u.test(result.os))fail('SEP_NATIVE_OS_SCOPE');
 const mapped=await run('volume-df','/bin/df',['-P',root]),volume=parseDfVolume(mapped.stdout);
 const disk=await run('disk-info','/usr/sbin/diskutil',['info','-plist',volume.device]);
 const converted=await run('disk-info-json','/usr/bin/plutil',['-convert','json','-o','-','-'],{input:disk.stdout}),info=JSON.parse(converted.stdout);
 const [rootStat,mountStat,mountReal]=await Promise.all([stat(root,{bigint:true}),stat(volume.mountPoint,{bigint:true}),realpath(volume.mountPoint)]);
 result.volumeObserved={df:volume,DeviceNode:info.DeviceNode??null,MountPoint:info.MountPoint??null,Mounted:Object.hasOwn(info,'Mounted')?info.Mounted:null,rootDev:rootStat.dev.toString(),mountDev:mountStat.dev.toString(),mountReal};
 result.filesystem=verifyVolumeBinding({df:volume,info,root,rootDev:rootStat.dev,mountDev:mountStat.dev,mountReal});
 const helper=join(root,'native-tree'),attachment=join(root,'native-attachments');
 await run('compile-tree','/usr/bin/xcrun',['clang','-std=c11','-O2','-Wall','-Wextra','-Werror','-arch','arm64',join(source,'apfs-tree/native-tree.c'),'-o',helper]);
 await run('compile-attachments','/usr/bin/xcrun',['clang','-std=c11','-O2','-Wall','-Wextra','-Werror','-arch','arm64',join(source,'media/native-attachments.c'),'-o',attachment]);
 result.helpers={project:{sha256:sha(await readFile(helper))},attachment:{sha256:sha(await readFile(attachment))}};
 Object.assign(env,{SEP_APFS_HELPER:helper,SEP_MAC_TREE_HELPER:helper,SEP_MAC_TREE_HELPER_SHA256:result.helpers.project.sha256,SEP_MAC_ATTACHMENT_HELPER:attachment});
 await mkdir(env.SEP_MAC_LOW_TEST_ROOT,{mode:0o700});
 await group('files-lifecycle',['apfs-tree/project-tree.test.mjs','profile/controlled-files.test.mjs'],33,'real native APFS helper, SQLite and Profile; synthetic caller and declared fault seams');
 await group('transactions',['transactions/transactions.test.mjs','transactions/recovery-result.test.mjs'],29,'real native APFS helper, SQLite, SIGKILL and durable recovery');
 await group('attachment-io',['media/attachment-io.test.mjs'],12,'real native APFS attachment helper and bounded inventory/deletion');
 await group('business-portable',['business/runtime-scope.test.mjs','business/document-plan-binding.test.mjs','transactions/document-plan.test.mjs','parser/parser-contract.test.mjs'],24,'portable VM dependency seams, real in-memory SQLite authorization and parser input/origin contracts',['--experimental-vm-modules']);
 await group('origin-control',['transactions/origin.test.mjs','project-workflow/preview.test.mjs','project-workflow/derive-sources.test.mjs','project-workflow/control-boundaries.test.mjs'],18,'portable source derivation and workflow-control contracts');
 await group('pending-manifest',['desktop/project-workflow-product/pending-startup/package-inputs.test.mjs'],1,'current source binding only; no installed desktop claim');
 await group('workflow-native',['native-revalidation/workflow.test.mjs'],17,'current derived readonly transactions + actual APFS/Profile; synthetic user confirmation authority');
 await group('business-derived-import',['document-business/inspect-origins.test.mjs'],1,'complete-source derivation/import using exact official host dependencies; not live host invocation',['--import',pathToFileURL(join(source,'native-revalidation/dependency-hook.mjs')).href]);
 const after=await verifyInputs();if(after.manifestSha256!==result.inputs.manifestSha256)fail('SEP_NATIVE_INPUT_CHANGED');await json('INPUTS-AFTER.json',after);
 const cleanup=await readFile(join(env.SEP_MAC_WORKFLOW_TEST_ROOT,'CLEANUP.jsonl'),'utf8');const cleanupRows=cleanup.trim().split('\n').map(x=>JSON.parse(x));if(!cleanupRows.length||cleanupRows.some(x=>x.receipt?.status!=='pass'||x.receipt?.resourcesConfirmedReleased!==true))fail('SEP_NATIVE_WORKFLOW_CLEANUP');result.workflowCleanup={rows:cleanupRows.length,sha256:sha(cleanup),scope:'fixture-owned controller receipts; not whole-system zero-resource audit'};
 result.status=result.groups.length===8&&result.groups.every(x=>x.status==='pass')?'pass':'fail';result.counts={definitions:135,passed:result.groups.filter(x=>x.status==='pass').reduce((n,x)=>n+x.pass,0)};
}catch(e){result.code=e.code??'UNCLASSIFIED';}
await json('RESULT.json',result);console.log(JSON.stringify({status:result.status,groups:result.groups,code:result.code??null,root}));process.exitCode=result.status==='pass'?0:1;
