import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=dirname(fileURLToPath(import.meta.url)),root=process.argv[2];
if(process.platform!=='darwin'||process.arch!=='arm64'){console.log(JSON.stringify({status:'not_run',code:'NATIVE_MAC_REQUIRED'}));process.exit(78);}
if(!root||resolve(root)!==root)throw Error('EXPLICIT_CANONICAL_ROOT_REQUIRED');
await mkdir(root,{mode:0o700});if(await realpath(root)!==root)throw Error('ROOT_ALIAS');
const sha=data=>createHash('sha256').update(data).digest('hex');
const result={status:'fail',platform:process.platform,arch:process.arch,node:process.version,source:{},runs:[],scope:'Native APFS bounded fd traversal/copy/controlled file mutation; no desktop or arbitrary Shell sandbox claim'};
for(const name of ['native-tree.c','project-tree.mjs','test-native.py','project-tree.test.mjs','run-tests.mjs'])result.source[name]=sha(await readFile(join(source,name)));
function run(name,executable,args,env={}){
 const r=spawnSync(executable,args,{encoding:'utf8',env:{...process.env,...env},timeout:60000,maxBuffer:1048576});
 result.runs.push({name,status:r.status===0?'pass':'fail',exit:r.status,signal:r.signal,error:r.error?.code??null});
 return writeFile(join(root,name+'.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx',mode:0o600}).then(()=>{if(r.status!==0)throw Error(name+'_FAILED');});
}
try{
 const helper=join(root,'native-tree');await run('compile','/usr/bin/xcrun',['clang','-std=c11','-O2','-Wall','-Wextra','-Werror','-arch','arm64',join(source,'native-tree.c'),'-o',helper]);
 result.helperSha256=sha(await readFile(helper));
 for(let round=1;round<=3;round++){
  await run('native-'+round,'/usr/bin/python3',[join(source,'test-native.py'),helper,join(root,'native-'+round)]);
  await run('wrapper-'+round,process.execPath,['--test',join(source,'project-tree.test.mjs')],{SEP_APFS_TEST_ROOT:join(root,'wrapper-'+round),SEP_APFS_HELPER:helper});
 }
 result.status='pass';result.counts={nativePerRound:30,wrapperPerRound:7,rounds:3};
}catch(e){result.code=/^[A-Za-z0-9_-]+$/u.test(e.message)?e.message:'FAILED';process.exitCode=1;}
await writeFile(join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
