import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createManagedUpdater} from '../update-desktop.mjs';

const alpha={id:123,tag_name:'dsh-v0.2.1-alpha.1',draft:false,prerelease:true,
 html_url:'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1',published_at:'2026-10-03T06:42:19Z',body:'Synthetic public notes'};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function until(predicate){for(let i=0;i<300;i++){if(predicate())return;await delay(10);}assert.fail('condition not reached');}
async function fixture(t,{root,fetcher,dialog,prepareSep}={}){
 root??=await mkdtemp(join(tmpdir(),'sep-filter-'));
 await mkdir(join(root,'program/node_modules/dsh-system-enhancement-package'),{recursive:true});
 await writeFile(join(root,'program/node_modules/dsh-system-enhancement-package/package.json'),JSON.stringify({version:'0.2.1-beta.1'}));
 await writeFile(join(root,'program/package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));
 await writeFile(join(root,'program/graph.json'),JSON.stringify({roots:{},packages:[],files:[]}));
 const notices=[],preferences=[],assessments=[],requests=[];
 const updater=createManagedUpdater({app:{getPath:()=>root,getVersion:()=> '0.2.0-rc.2'},dialog:{showMessageBox:async o=>{notices.push(o);return dialog?dialog(o):{response:1};}},BrowserWindow:class {},powerMonitor:new EventEmitter(),projectDir:join(root,'program'),profileContext:{home:null,overlayFiles:[],installAnchor:join(root,'program/package.json')},fetcher:async(url,options)=>{requests.push(url);return fetcher?fetcher(url,options):Response.json(url.includes('deepseek-ai/deepseek-harness')?[alpha]:[]);},...(prepareSep?{prepareSep}:{}),onPreferences:p=>preferences.push(p),onAssessment:async a=>assessments.push(a)});
 t.after(()=>updater.close());return {updater,root,notices,preferences,assessments,requests};
}

test('new and restarted instances preserve the explicit filter without clearing other state',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.updater.getUpdatePreferences(),{strength:'strong'});
 await writeFile(join(f.root,'unrelated-ledger.json'),'preserved');
 await f.updater.setUpdatePreferences('weak');assert.deepEqual(await f.updater.getUpdatePreferences(),{strength:'weak'});
 await until(()=>f.notices.some(n=>n.message.includes('0.2.1-alpha.1')));
 assert.equal(f.updater.status().phase,'candidate-unavailable');
 assert.equal(f.assessments.length,1);assert.equal(f.assessments[0].release.version,'0.2.1-alpha.1');
 f.updater.close();const reopened=await fixture(t,{root:f.root});assert.deepEqual(await reopened.updater.getUpdatePreferences(),{strength:'weak'});
 assert.equal(await readFile(join(f.root,'unrelated-ledger.json'),'utf8'),'preserved');
 assert.deepEqual(f.preferences,[{strength:'weak'}]);
});

test('default strong hides alpha and weak rescans even from an installed RC',async t=>{
 const f=await fixture(t);await f.updater.check();assert.equal(f.updater.status().phase,'idle');assert.equal(f.assessments.length,0);
 await f.updater.setUpdatePreferences('weak');await until(()=>f.updater.status().phase==='candidate-unavailable');
 assert.equal(f.updater.status().version,'0.2.1-alpha.1');
 await f.updater.setUpdatePreferences('strong');await until(()=>f.updater.status().phase==='idle');
 assert.equal(f.updater.status().version,undefined);
});

test('invalid preference is refused and failed durable save does not publish the new value',async t=>{
 const f=await fixture(t);await assert.rejects(f.updater.setUpdatePreferences('all'),/UPDATE_FILTER_INVALID/);
 assert.deepEqual(await f.updater.getUpdatePreferences(),{strength:'strong'});
 await mkdir(join(f.root,'sep-updates/update-preferences.json'),{recursive:true});
 await assert.rejects(f.updater.setUpdatePreferences('weak'));
 assert.deepEqual(await f.updater.getUpdatePreferences(),{strength:'strong'});assert.deepEqual(f.preferences,[]);
});

test('concurrent edits commit in call order and survive restart',async t=>{
 const f=await fixture(t);await Promise.all([f.updater.setUpdatePreferences('weak'),f.updater.setUpdatePreferences('medium'),f.updater.setUpdatePreferences('strong')]);
 assert.deepEqual(f.preferences.map(p=>p.strength),['weak','medium','strong']);
 f.updater.close();const reopened=await fixture(t,{root:f.root});assert.deepEqual(await reopened.updater.getUpdatePreferences(),{strength:'strong'});
});

test('malformed stored settings fail visibly without silently relaxing filtering',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'sep-updates'),{recursive:true});await writeFile(join(f.root,'sep-updates/update-preferences.json'),'{bad');
 await assert.rejects(f.updater.getUpdatePreferences(),/UPDATE_PREFERENCES_INVALID/);
 await f.updater.check();assert.equal(f.updater.status().phase,'error');assert.equal(f.requests.length,0);
});

test('tightening the filter invalidates a delayed alpha response and old dialog action',async t=>{
 const answer=deferred();const f=await fixture(t,{dialog:o=>o.message.includes('0.2.1-alpha.1')?answer.promise:{response:1}});
 await f.updater.setUpdatePreferences('weak');await until(()=>f.notices.some(n=>n.message.includes('0.2.1-alpha.1')));
 await f.updater.setUpdatePreferences('strong');answer.resolve({response:0});await until(()=>f.updater.status().phase==='idle');await delay(30);
 assert.equal(f.updater.status().version,undefined);
 assert.equal((await readdir(join(f.root,'sep-updates'))).some(n=>n==='queued-request.json'||n==='auto-request.json'),false);
});

test('an uncooperative fetch finishing after a filter change cannot resurrect an alpha notice',async t=>{
 const response=deferred();let first=true;const f=await fixture(t,{fetcher:async(url)=>{if(url.includes('deepseek-ai/deepseek-harness')){if(first){first=false;return response.promise;}return Response.json([alpha]);}return Response.json([]);}});
 await f.updater.setUpdatePreferences('weak');await until(()=>f.requests.length>0);
 await f.updater.setUpdatePreferences('strong');await until(()=>f.updater.status().phase==='idle');response.resolve(Response.json([alpha]));await delay(40);
 assert.equal(f.updater.status().version,undefined);assert.equal(f.assessments.length,0);assert.equal(f.notices.some(n=>n.message.includes('0.2.1-alpha.1')),false);
});

test('closed updater rejects settings writes',async t=>{
 const f=await fixture(t);f.updater.close();await assert.rejects(f.updater.setUpdatePreferences('weak'),/UPDATE_CLOSED/);
});


test('a late SEP alpha confirmation cannot prepare a download after switching to strong',async t=>{
 const base='https://github.com/Lance-QwQ/DSH-SEP/releases',tag='v0.3.0-alpha.1';
 const body=JSON.stringify({schema:1,product:'dsh-sep',platform:process.platform+'-'+process.arch,sepVersion:'0.3.0-alpha.1',hostVersion:'0.2.0-rc.2',bundle:{name:'sep.zip',sha256:'a'.repeat(64),url:base+'/download/'+tag+'/sep.zip'}});
 const row={tag_name:tag,draft:false,prerelease:true,published_at:'2026-10-03T00:00:00Z',html_url:base+'/tag/'+tag,assets:[{id:7,name:'dsh-sep-update.json',browser_download_url:base+'/download/'+tag+'/dsh-sep-update.json',digest:'sha256:'+createHash('sha256').update(body).digest('hex')}]};
 const answer=deferred();let preparations=0;
 const f=await fixture(t,{fetcher:async url=>url.includes('deepseek-ai/deepseek-harness')?Response.json([]):url.endsWith('/assets/7')?new Response(body):Response.json([row]),dialog:o=>o.message.includes('0.3.0-alpha.1')?answer.promise:{response:1},prepareSep:async()=>{preparations++;}});
 await f.updater.setUpdatePreferences('weak');await until(()=>f.notices.some(n=>n.message.includes('0.3.0-alpha.1')));
 assert.equal(f.updater.sepStatus().version,'0.3.0-alpha.1');
 await f.updater.setUpdatePreferences('strong');answer.resolve({response:0});await until(()=>f.updater.sepStatus().phase==='idle');await delay(30);
 assert.equal(preparations,0);assert.equal(f.updater.sepStatus().version,undefined);
 assert.equal((await readdir(join(f.root,'sep-updates'))).includes('auto-request.json'),false);
});
