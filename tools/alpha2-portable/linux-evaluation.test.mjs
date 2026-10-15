import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,stat,realpath,symlink,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {bundleRoot} from './bundle-modules.mjs';
import {fixture} from './transaction-fixtures.mjs';
import {hash} from './project-tree.mjs';
const mod=await import('./linux-evaluation.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('Linux evaluation admits only canonical absolute POSIX backend paths',()=>{
 assert.equal(typeof mod.validNativeBackendPath,'function');
 for(const p of ['/opt/sep/evaluation/lifecycle.py','/home/sep/eval/lifecycle.py'])assert(mod.validNativeBackendPath(p,true));
 for(const p of ['relative/lifecycle.py','/opt/../lifecycle.py','/opt//lifecycle.py','/opt/./lifecycle.py','/opt/evil\\lifecycle.py','/opt/lifecycle.py\n','/opt/not-entry.py'])assert.equal(mod.validNativeBackendPath(p,true),false,p);
});
async function config(){const f=await fixture(),state=join(f.base,'evaluation-state');await mkdir(state,{mode:0o700});const s=await stat(state),path=join(f.base,'evaluation-config.json'),body=JSON.stringify({state,projectId:'linux-native',expectedCatalogSha256:'a'.repeat(64)});await writeFile(path,body,{mode:0o600});const python=await realpath('/usr/bin/python3');return {f,python,runtime:{python,pythonSha256:hash(await readFile(python))},config:{enabled:true,projectId:'linux-native',catalogSha256:'a'.repeat(64),backend:{entry:join(bundleRoot,'bundle/modules/trusted-evaluation-entry/evaluation/lifecycle.py'),configPath:path,configSha256:hash(body),stateIdentity:hash(`${state}:${s.dev}:${s.ino}`)}}};}
test('Linux native evaluation preflight binds packaged backend, Python, config and state before spawn',async()=>{
 const i=await config();assert.equal(typeof mod.prepareNativeEvaluation,'function');const prepared=await mod.prepareNativeEvaluation(i.config,i.runtime);assert.equal(prepared.command,i.python);assert.equal(prepared.scope,'linux-native-evaluation-launch-only');assert.equal(prepared.usesWsl,false);assert.equal(prepared.inputHashes.config,i.config.backend.configSha256);
});
test('Linux evaluation refuses changed config, Python hash, foreign backend and state identities',async()=>{
 for(const kind of ['config','python','entry','state']){const i=await config();if(kind==='config')i.config.backend.configSha256='0'.repeat(64);if(kind==='python')i.runtime.pythonSha256='0'.repeat(64);if(kind==='entry')i.config.backend.entry='/usr/bin/lifecycle.py';if(kind==='state')i.config.backend.stateIdentity='0'.repeat(64);await assert.rejects(()=>mod.prepareNativeEvaluation(i.config,i.runtime),e=>/^SEP_LINUX_EVAL_/.test(e.code));}
});
test('Linux evaluation refuses config aliases and leaked state permissions',async()=>{
 const i=await config(),p=join(i.f.base,'alias.json');await symlink(i.config.backend.configPath,p);i.config.backend.configPath=p;await assert.rejects(()=>mod.prepareNativeEvaluation(i.config,i.runtime),{code:'SEP_LINUX_EVAL_CONFIG_IDENTITY'});
 const j=await config(),body=JSON.parse(await readFile(j.config.backend.configPath));await chmod(body.state,0o755);await assert.rejects(()=>mod.prepareNativeEvaluation(j.config,j.runtime),{code:'SEP_LINUX_EVAL_STATE'});
});
test('Linux evaluation rechecks prepared bytes at dispatch and refuses changed inputs before any child',async()=>{
 const i=await config(),prepared=await mod.prepareNativeEvaluation(i.config,i.runtime);await writeFile(i.config.backend.configPath,'{}');assert.throws(()=>prepared.spawnBackend('a'.repeat(64)),{code:'SEP_LINUX_EVAL_INPUT_CHANGED'});assert.throws(()=>prepared.spawnBackend('not-a-challenge'),{code:'SEP_LINUX_EVAL_CHALLENGE'});
});
test('Linux actual frozen lifecycle Entry is transformed only at its native path validator',async()=>{
 assert.equal(typeof mod.loadNativeEntry,'function');const loaded=await mod.loadNativeEntry();assert.equal(typeof loaded.Entry,'function');assert.equal(loaded.origin.transformations.length,1);assert.equal(loaded.origin.sha256,'2fed151e7d5a85af798b35c6fdfcd13b01333c2661764520577da86513c1f86a');
});
