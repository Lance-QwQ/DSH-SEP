import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {release} from 'node:os';
import assert from 'node:assert/strict';
const exec=promisify(execFile),source=fileURLToPath(new URL('.',import.meta.url)),output=resolve(process.argv[2]??'');assert(process.argv[2]);assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');await mkdir(output,{recursive:false,mode:0o700});
async function command(exe,args,label,env=process.env){let r;try{r=await exec(exe,args,{env,timeout:90000,maxBuffer:2097152});}catch(e){r=e;}await writeFile(join(output,label+'.log'),String(r.stdout??'')+'\n'+String(r.stderr??''),{flag:'wx'});if(r.code!==undefined)throw r;return r;}
const system=await command('/usr/bin/sw_vers',[],'system');await writeFile(join(output,'platform.json'),JSON.stringify({platform:process.platform,arch:process.arch,darwin:release(),swVers:system.stdout},null,2),{flag:'wx'});
for(const name of ['task-owner','task-probe']){await command('/usr/bin/clang',['-O2','-Wall','-Wextra','-Werror',join(source,name+'.c'),'-o',join(output,name)],'compile-'+name);await chmod(join(output,name),0o555);}
await command(process.execPath,['--test',join(source,'task-contract.test.mjs')],'contract',{...process.env,SEP_MAC_TASK_CONTRACT_ROOT:join(output,'contracts')});
await command(process.execPath,['--test',join(source,'task-worker.test.mjs')],'worker',{...process.env,SEP_MAC_TASK_TEST_ROOT:join(output,'tasks'),SEP_MAC_TASK_OWNER:join(output,'task-owner'),SEP_MAC_TASK_PROBE:join(output,'task-probe')});
