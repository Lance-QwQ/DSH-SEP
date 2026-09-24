import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const baseline = new URL('../../../deliverables/DSH-SEP-Windows-Alpha-20260921-MIT/DSH-SEP-Full/payload/store/p0498/lib/index.js', import.meta.url);
const source = await readFile(process.env.SEP_HOST_TEST_ENTRY || baseline, 'utf8');
const main = source.slice(source.indexOf('async function main()'), source.indexOf('\nif (import.meta.main)'));
let lifecycle;
try { lifecycle = await import('./sep-host-lifecycle.mjs'); } catch(error) { if(error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
function fixture({connected=true,application,office,shutdown}={}) {
 const owner = new EventEmitter();
 Object.assign(owner,{argv:['node','entry','C:/fixture/runtime','C:/fixture/project'],env:{DSH_SEP_HOST_NONCE:'a'.repeat(64),DSH_SEP_HOST_GENERATION:'1'},pid:12345,connected,execPath:'node',sent:[],exits:[],exitCode:undefined});
 owner.send=(message,callback)=>{owner.sent.push(message);queueMicrotask(()=>callback?.(null));};
 owner.disconnect=()=>{if(owner.connected){owner.connected=false;owner.emit('disconnect');}};
 owner.exit=code=>owner.exits.push(code);
 const facts={starts:0,shutdowns:0,office:0};
 const ctx={provide(){},plugin:async()=>{facts.office++;return office;},connection:{authenticatedUrl:x=>x},webServer:{port:1,collectIndexInjections:()=>[]}};
 const app={ctx,shutdown:{shutdown:async()=>{facts.shutdowns++;return shutdown;}}};
 const deps={process:owner,join3:join,readFile2:async()=>JSON.stringify({version:'0.1.6-alpha.2'}),loadProfileDirectory:()=>({}),runProfile:()=>{facts.starts++;return application??Promise.resolve(app);},loadLayeredEnv:()=>({}),fileURLToPath,installSepPluginPolicy(){},installDesktopUpdateTaskControl:()=>()=>false,resolveDshHome:()=>'',office_exports:{},console:{error(){}},createHostLifecycle: options=>lifecycle.createHostLifecycle({...options,owner,shutdownTimeoutMs:35,report(){},exit:owner.exit})};
 const invoke = new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${main.replaceAll('import.meta.url',JSON.stringify(new URL('./index.js',import.meta.url).href))};return main();`);
 return {owner,facts,app,start:()=>invoke(deps)};
}

test('managed host rejects absent parent IPC before starting application',async()=>{
 const f=fixture({connected:false});
 await assert.rejects(f.start(),/SEP_HOST_PARENT_UNAVAILABLE/);
 assert.equal(f.facts.starts,0);
});
test('disconnect during pending application is bounded and cannot publish ready later',async()=>{
 const pending=deferred(),f=fixture({application:pending.promise});const starting=f.start();starting.catch(()=>{});
 await delay(0);f.owner.disconnect();await delay(70);
 assert.deepEqual(f.owner.exits,[1]);
 pending.resolve(f.app);await starting.catch(()=>{});await delay(0);
 assert.equal(f.owner.sent.filter(x=>x.type==='ready').length,0);
 assert.equal(f.owner.sent.filter(x=>x.type==='shutdown-complete').length,0);
 assert.equal(f.facts.office,0);
});
test('shutdown during pending startup prevents new office setup and late ready',async()=>{
 const pending=deferred(),f=fixture({application:pending.promise});const starting=f.start();starting.catch(()=>{});
 await delay(0);f.owner.emit('message',{type:'shutdown'});pending.resolve(f.app);await starting.catch(()=>{});await delay(5);
 assert.equal(f.facts.office,0);assert.equal(f.owner.sent.some(x=>x.type==='ready'),false);
 assert.equal(f.facts.shutdowns,1);assert.equal(f.owner.sent.filter(x=>x.type==='shutdown-complete').length,1);
});
test('shutdown during office setup cannot publish ready when setup finishes',async()=>{
 const pending=deferred(),f=fixture({office:pending.promise});const starting=f.start();starting.catch(()=>{});
 await delay(0);f.owner.emit('message',{type:'shutdown'});await delay(5);pending.resolve();await starting.catch(()=>{});
 assert.equal(f.owner.sent.some(x=>x.type==='ready'),false);assert.equal(f.facts.shutdowns,1);
});
test('hung normal shutdown reaches failure deadline without clean acknowledgement',async()=>{
 const f=fixture({shutdown:new Promise(()=>{})});await f.start();f.owner.emit('message',{type:'shutdown'});await delay(70);
 assert.deepEqual(f.owner.exits,[1]);assert.equal(f.owner.sent.some(x=>x.type==='shutdown-complete'),false);
});
test('normal ready plus repeated shutdown drains once and acknowledges once',async()=>{
 const f=fixture();await f.start();f.owner.emit('message',{type:'shutdown'});f.owner.emit('message',{type:'shutdown'});await delay(5);
 assert.equal(f.owner.sent.filter(x=>x.type==='ready').length,1);assert.equal(f.facts.shutdowns,1);
 assert.equal(f.owner.sent.filter(x=>x.type==='shutdown-complete').length,1);assert.deepEqual(f.owner.exits,[]);
});
