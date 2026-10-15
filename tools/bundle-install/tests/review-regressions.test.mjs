
import assert from 'node:assert/strict';import {test} from 'node:test';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';import {owned} from './native-settings-fixture.mjs';
const repo=resolve(process.env.SEP_SOURCE_REPO),hash=b=>createHash('sha256').update(b).digest('hex');
const paths=['/opt/dsh-sep-eval/../../tmp/lifecycle.py','/opt/dsh-sep-eval/x/../lifecycle.py','/opt/dsh-sep-eval//lifecycle.py','/opt/dsh-sep-eval/x\\/lifecycle.py'];
const backend={entry:'/opt/dsh-sep-eval/lifecycle.py',configPath:'/opt/dsh-sep-eval/config.json',configSha256:'a'.repeat(64),stateIdentity:'b'.repeat(64)};
test('evaluation configuration rejects traversal and malformed canonical paths in both entry and config',async()=>{
 const {businessConfig}=await owned('lib/settings-consumers.js');const base={enabled:true,projectId:'synthetic',catalogSha256:'c'.repeat(64),backend};
 assert.doesNotThrow(()=>businessConfig.parse({sources:['资料'],evaluation:base}));
 for(const key of ['entry','configPath'])for(const value of paths)assert.throws(()=>businessConfig.parse({sources:['资料'],evaluation:{...base,backend:{...backend,[key]:value}}}));
});
test('direct Entry rejects unsafe paths before an external spawn even without the settings schema',async()=>{
 const {Entry}=await owned('host/evaluation-entry/entry.mjs');let spawned=0;
 for(const key of ['entry','configPath'])for(const value of paths){const e=new Entry({}, {enabled:true,backend:{...backend,[key]:value},project:{catalogSha256:'c'.repeat(64)}},{spawnBackend:()=>{spawned++;throw Error('PROBE_SPAWN_REACHED');}});
  await assert.rejects(e.start(),/BACKEND_CONFIG/);
 }assert.equal(spawned,0);
});
test('fixture origin chains replay to the actual HEAD bytes',async()=>{
 for(const [manifest,target] of [['native-settings-fixture.origin.json','native-settings-fixture.mjs'],['native-browser-fixture.origin.json','native-browser-fixture.mjs'],['../../../bundle/lib/settings-runtime.origin.json','../../../bundle/lib/settings-runtime.js'],['../../../bundle/lib/settings-consumers.origin.json','../../../bundle/lib/settings-consumers.js'],['../../../bundle/lib/native-settings-installation.origin.json','../../../bundle/lib/native-settings-installation.js'],['../../../bundle/host/evaluation-entry/entry.origin.json','../../../bundle/host/evaluation-entry/entry.mjs'],['../../../bundle/host/layered-memory/origin.json','../../../bundle/host/layered-memory/index.js']]){
  const record=JSON.parse(await readFile(join(repo,'tools/bundle-install/tests',manifest)));const source=record.source??record.base;
  let bytes=await readFile(join(repo,source));assert.equal(hash(bytes),record.sourceSha256??record.sha256);let value=bytes.toString().replaceAll('\r\n','\n');
  for(const change of record.changes??record.transformations){const [old,next]=Array.isArray(change)?change:[change.old,change.new];assert.equal(value.split(old).length-1,1);value=value.replace(old,next);}
  const result=await readFile(join(repo,'tools/bundle-install/tests',target));assert.equal(value,result.toString().replaceAll('\r\n','\n'));assert.equal(hash(result),record.resultSha256);
 }
});
test('Windows CI publishes a portable runner temp directory with artifact-compatible separators',async()=>{
 const dir=await mkdtemp(join(process.env.SEP_BUNDLE_TEST_ROOT,'ci-env-')),envfile=join(dir,'env.txt');await writeFile(envfile,'');
 const workflow=await readFile(join(repo,'.github/workflows/sep-bundle-portable.yml'),'utf8');const snippet=workflow.slice(workflow.indexOf('$out ='),workflow.indexOf('$pm ='));
 const result=spawnSync('pwsh',['-NoProfile','-Command',snippet],{env:{...process.env,RUNNER_TEMP:dir,GITHUB_ENV:envfile,GITHUB_RUN_ID:'sep-synthetic',GITHUB_RUN_ATTEMPT:'1'},encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);const value=(await readFile(envfile,'utf8')).trim().split('=').slice(1).join('=');
 assert(value.startsWith(dir.replaceAll('\\','/')+'/'));assert(!value.includes('\\'));
});

test('consumer cleanup attempts independent resources when evaluation blocks and retries only unfinished resources',async()=>{
 let createConsumerCleanup;try{({createConsumerCleanup}=await owned('lib/consumer-cleanup.js'));}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('consumer cleanup orchestration missing');throw error;}
 let repair=false,stops=0,childClosed=0,layersClosed=0;const evaluation={stop:async()=>{stops++;return {status:repair?'pass':'blocked'};}};
 const evaluationFiber={dispose:async()=>{assert(repair);}},fiber={dispose:async()=>{childClosed++;}};
 const close=createConsumerCleanup({getEvaluation:()=>evaluation,getEvaluationFiber:()=>evaluationFiber,fibers:[fiber,evaluationFiber],getLayers:()=>({close:async()=>{layersClosed++;}})});
 const first=close();assert.equal(close(),first);await assert.rejects(first,{code:'SEP_EVALUATION_CLEANUP_BLOCKED'});assert.equal(childClosed,1);assert.equal(layersClosed,1);
 repair=true;await close();assert.equal(stops,2);assert.equal(childClosed,1);assert.equal(layersClosed,1);await close();assert.equal(stops,2);
});
test('consumer cleanup preserves evaluation start diagnosis and independently retries a failed child disposer',async()=>{
 let createConsumerCleanup;try{({createConsumerCleanup}=await owned('lib/consumer-cleanup.js'));}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('consumer cleanup orchestration missing');throw error;}
 let repair=false,disposed=0,layer=0;const child={dispose:async()=>{disposed++;if(!repair)throw Object.assign(Error('private body'),{code:'SYNTHETIC_DISPOSE'});}};
 const close=createConsumerCleanup({getEvaluation:()=>({stop:async()=>({status:'blocked'})}),getEvaluationFiber:()=>undefined,fibers:[child],getLayers:()=>({close:async()=>{layer++;}})});
 await assert.rejects(close(),e=>e.code==='SEP_EVALUATION_CLEANUP_BLOCKED'&&e.causes.some(c=>c.code==='SYNTHETIC_DISPOSE'));assert.equal(layer,1);
 repair=true;await assert.rejects(close(),{code:'SEP_EVALUATION_CLEANUP_BLOCKED'});assert.equal(disposed,2);assert.equal(layer,1);
});

test('trusted diagnostics retain nested classified failure without raw body or path',async()=>{
 let failureDiagnostic;try{({failureDiagnostic}=await owned('lib/failure-diagnostic.js'));}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('redacted classified diagnosis missing');throw error;}
 const output=failureDiagnostic(Object.assign(Error('private body C:/private/key'),{code:'SEP_EVALUATION_UNAVAILABLE',cause:{code:'BACKEND_READY_TIMEOUT'}}));
 assert.equal(output.code,'SEP_EVALUATION_UNAVAILABLE');assert.equal(output.causeCode,'BACKEND_READY_TIMEOUT');assert(!JSON.stringify(output).includes('private'));
 const unclassified=failureDiagnostic(Object.assign(Error('private body'),{code:'private body'}));assert.equal(unclassified.code,'UNCLASSIFIED_FAILURE');
});
