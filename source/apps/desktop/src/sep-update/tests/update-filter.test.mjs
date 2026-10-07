import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {selectRelease,UpdateClock} from '../update-core.mjs';
import {fetchSepRelease,SEP_RELEASES} from '../update-sep.mjs';

const host='0.2.0-rc.2';
const official='https://github.com/deepseek-ai/deepseek-harness/releases';
const sepBase='https://github.com/Lance-QwQ/DSH-SEP/releases';
function officialRelease(version,patch={}){
 const tag='v'+version;
 return {id:1,tag_name:tag,draft:false,prerelease:version.includes('-'),published_at:'2026-10-03T00:00:00Z',html_url:official+'/tag/'+tag,...patch};
}
function sepRelease(id,sepVersion,{hostVersion=host,tag='historical-release-'+id,platform='win32-x64',draft=false}={}){
 const body=JSON.stringify({schema:1,product:'dsh-sep',platform,sepVersion,hostVersion,bundle:{name:'sep.zip',sha256:'a'.repeat(64),url:sepBase+'/download/'+tag+'/sep.zip'}});
 return {body,row:{tag_name:tag,draft,prerelease:sepVersion.includes('-'),published_at:'2026-10-03T00:00:00Z',html_url:sepBase+'/tag/'+tag,assets:[{id,name:'dsh-sep-update.json',browser_download_url:sepBase+'/download/'+tag+'/dsh-sep-update.json',digest:'sha256:'+createHash('sha256').update(body).digest('hex')}]}};
}
function legacy(){return {row:{tag_name:'windows-alpha',draft:false,prerelease:true,published_at:'2026-09-21T00:00:00Z',html_url:sepBase+'/tag/windows-alpha',assets:[]}};}
async function discover(items,options={}){
 const fetcher=async(url)=>{
  if(url===SEP_RELEASES)return new Response(JSON.stringify(items.map(item=>item.row)));
  const item=items.find(item=>item.row.assets.some(asset=>'https://api.github.com/repos/Lance-QwQ/DSH-SEP/releases/assets/'+asset.id===url));
  assert.ok(item,'discovery only requests listed manifest assets');
  return new Response(item.body);
 };
 return fetchSepRelease({installedSepVersion:'0.2.0',hostVersion:host,platform:'win32-x64',fetcher,...options});
}

for(const [strength,accepted,rejected] of [
 ['weak',['0.3.0-alpha.1','0.3.0-beta.1','0.3.0-rc.1','0.3.0'],[]],
 ['medium',['0.3.0-beta.1','0.3.0-rc.1','0.3.0'],['0.3.0-alpha.1']],
 ['strong',['0.3.0-rc.1','0.3.0'],['0.3.0-alpha.1','0.3.0-beta.1']],
]){
 test('DSH '+strength+' uses the chosen channels independently of the installed channel',()=>{
  for(const version of accepted)assert.equal(selectRelease([officialRelease(version)],'0.2.0',strength)?.version,version);
  for(const version of rejected)assert.equal(selectRelease([officialRelease(version)],'0.2.0-alpha.1',strength),null);
 });
 test('SEP '+strength+' filters verified manifest versions including historical release tags',async()=>{
  for(const version of accepted)assert.equal((await discover([sepRelease(1,version)],{filterStrength:strength})).release?.sepVersion,version);
  for(const version of rejected)assert.equal((await discover([sepRelease(1,version)],{installedSepVersion:'0.2.0-alpha.1',filterStrength:strength})).release,null);
 });
}

test('DSH defaults to strong even when the installed version is alpha',()=>{
 assert.equal(selectRelease([officialRelease('0.3.0-alpha.1')],'0.2.0-alpha.1'),null);
 assert.equal(selectRelease([officialRelease('0.3.0-rc.1')],'0.2.0')?.version,'0.3.0-rc.1');
});
test('SEP defaults to strong even when the installed version is beta',async()=>{
 assert.equal((await discover([sepRelease(1,'0.3.0-beta.1')],{installedSepVersion:'0.2.0-beta.1'})).release,null);
 assert.equal((await discover([sepRelease(1,'0.3.0-rc.1')])).release?.sepVersion,'0.3.0-rc.1');
});
test('DSH selects the newest allowed nondraft version and never downgrades',()=>{
 const rows=['0.2.0','0.3.0-beta.2','0.3.0-rc.1','0.4.0-alpha.1'].map(version=>officialRelease(version));
 rows.push(officialRelease('0.5.0',{draft:true}));
 assert.equal(selectRelease(rows,'0.2.0','medium')?.version,'0.3.0-rc.1');
 assert.equal(selectRelease([officialRelease('0.2.0'),officialRelease('0.1.0')],'0.2.0','weak'),null);
});
test('SEP selects the newest allowed nondraft version and never downgrades',async()=>{
 const items=[sepRelease(1,'0.3.0-beta.2'),sepRelease(2,'0.3.0-rc.1'),sepRelease(3,'0.4.0-alpha.1'),sepRelease(4,'0.5.0',{draft:true})];
 assert.equal((await discover(items,{filterStrength:'medium'})).release?.sepVersion,'0.3.0-rc.1');
 assert.equal((await discover([sepRelease(1,'0.2.0'),sepRelease(2,'0.1.0')],{filterStrength:'weak'})).release,null);
});
test('DSH rejects unknown or nonstandard prerelease channels at every strength',()=>{
 for(const strength of ['weak','medium','strong'])for(const version of ['0.3.0-preview.1','0.3.0-alpha','0.3.0-beta.1-custom.2','0.3.0-RC.1'])assert.equal(selectRelease([officialRelease(version)],'0.2.0',strength),null);
});
test('SEP rejects unknown or nonstandard prerelease channels at every strength',async()=>{
 for(const strength of ['weak','medium','strong'])for(const version of ['0.3.0-preview.1','0.3.0-alpha','0.3.0-beta.1-custom.2','0.3.0-RC.1'])assert.equal((await discover([sepRelease(1,version)],{filterStrength:strength})).release,null);
});
test('excluded SEP channels cannot produce an unrelated host-adaptation failure',async()=>{
 const result=await discover([sepRelease(1,'0.4.0-alpha.1',{hostVersion:'0.4.0'}),sepRelease(2,'0.3.0-rc.1'),legacy()]);
 assert.equal(result.release?.sepVersion,'0.3.0-rc.1');
 assert.deepEqual(result.coverage,{verifiedManifests:2,matchingPlatforms:2,missingManifests:1,manifestLimitReached:false});
});
test('eligible SEP host changes still require adaptation',async()=>{
 await assert.rejects(discover([sepRelease(1,'0.3.0-alpha.1',{hostVersion:'0.3.0'})],{filterStrength:'weak'}),/SEP_UPDATE_HOST_ADAPTATION_REQUIRED/);
});
test('SEP trusts the verified manifest channel instead of a misleading semver tag',async()=>{
 assert.equal((await discover([sepRelease(1,'0.3.0-alpha.1',{tag:'v0.3.0'})])).release,null);
 assert.equal((await discover([sepRelease(1,'0.3.0',{tag:'v0.3.0-alpha.1'})])).release?.sepVersion,'0.3.0');
});
test('excluded SEP manifests preserve missing and bounded metadata coverage',async()=>{
 const result=await discover([sepRelease(1,'0.3.0-alpha.1'),legacy()]);
 assert.equal(result.status,'metadata-partial');assert.equal(result.release,null);
 assert.deepEqual(result.coverage,{verifiedManifests:1,matchingPlatforms:1,missingManifests:1,manifestLimitReached:false});
 const limited=await discover(Array.from({length:6},(_,i)=>sepRelease(i+1,'0.3.0-alpha.1')));
 assert.equal(limited.status,'metadata-partial');assert.equal(limited.coverage.manifestLimitReached,true);assert.equal(limited.coverage.verifiedManifests,5);
});
test('allowed DSH release origins and SEP manifest hashes remain validated',async()=>{
 assert.throws(()=>selectRelease([officialRelease('0.3.0-alpha.1',{html_url:'https://example.com/release'})],'0.2.0','weak'),/UPDATE_RELEASE_ORIGIN/);
 const item=sepRelease(1,'0.3.0-alpha.1');item.body+=' ';
 await assert.rejects(discover([item]),/SEP_UPDATE_MANIFEST_CHANGED/);
});
test('invalid filter preferences fail before release selection or network access',async()=>{
 for(const value of ['','WEAK','stable',null,0,{},[]]){
  assert.throws(()=>selectRelease([],'0.2.0',value),/UPDATE_FILTER_INVALID/);
  await assert.rejects(fetchSepRelease({installedSepVersion:'0.2.0',hostVersion:host,filterStrength:value,fetcher:async()=>{throw Error('UNEXPECTED_NETWORK');}}),/UPDATE_FILTER_INVALID/);
 }
});

test('invalidating update discovery cancels its signal and permits an immediate fresh check',async()=>{
 const requests=[];
 const clock=new UpdateClock({now:()=>1000,check:signal=>{const pending=Promise.withResolvers();requests.push({signal,...pending});return pending.promise;}});
 const old=clock.open();await Promise.resolve();
 assert.equal(typeof clock.invalidate,'function','the clock must support preference invalidation');
 clock.invalidate();assert.equal(requests[0].signal.aborted,true);
 const fresh=clock.tick();await Promise.resolve();
 assert.equal(requests.length,2);assert.notEqual(fresh,old);assert.equal(requests[1].signal.aborted,false);
 requests[0].resolve();await old;
 assert.equal(clock.open(),fresh,'an old completion must not clear the fresh in-flight request');
 requests[1].resolve();await fresh;
 await clock.tick();assert.equal(requests.length,2);
 clock.invalidate();const next=clock.tick();await Promise.resolve();assert.equal(requests.length,3);
 clock.close();assert.equal(requests[2].signal.aborted,true);requests[2].resolve();await next;
 await clock.open();assert.equal(requests.length,3);
});
test('invalidating before the queued check starts preserves the old aborted signal',async()=>{
 const signals=[];const clock=new UpdateClock({check:async signal=>{signals.push(signal);}});
 const old=clock.open();
 assert.equal(typeof clock.invalidate,'function','the clock must support preference invalidation');
 clock.invalidate();const fresh=clock.open();await Promise.all([old,fresh]);
 assert.equal(signals.length,2);assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
 clock.close();
});
