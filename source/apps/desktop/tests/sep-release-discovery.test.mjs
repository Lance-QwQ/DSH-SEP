import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchSepRelease,SEP_RELEASES} from '../src/sep-update/update-sep.mjs';
const base='https://github.com/Lance-QwQ/DSH-SEP/releases';
function release(id,sepVersion='0.2.0-beta.2',patch={}){
 const tag='v'+sepVersion+'-fixture.'+id;
 const manifest={schema:1,product:'dsh-sep',platform:'win32-x64',sepVersion,hostVersion:'0.2.0-rc.2',bundle:{name:'sep.zip',sha256:'a'.repeat(64),url:base+'/download/'+tag+'/sep.zip'},...patch};
 const body=JSON.stringify(manifest);
 return {body,row:{tag_name:tag,draft:false,prerelease:true,published_at:'2026-09-27T00:00:00Z',html_url:base+'/tag/'+tag,assets:[{id,name:'dsh-sep-update.json',browser_download_url:base+'/download/'+tag+'/dsh-sep-update.json',digest:'sha256:'+createHash('sha256').update(body).digest('hex')}]}};
}
async function discover(items,{installed='0.2.0-beta.3-workflow.1',redirect=false,mutateResponse}={}){
 const requested=[];
 const fetcher=async(url,options)=>{
  requested.push(url);
  assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');
  options.signal.throwIfAborted();
  if(url===SEP_RELEASES)return new Response(JSON.stringify(items.map(v=>v.row)));
  if(redirect&&url.includes('/releases/assets/'))return new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/'+url.split('/').at(-1)}});
  const id=Number(url.split('/').at(-1)),item=items.find(v=>v.row.assets.some(a=>a.id===id));
  assert.ok(item,'only manifest assets may be fetched');
  return new Response(mutateResponse?mutateResponse(item.body):item.body);
 };
 const result=await fetchSepRelease({installedSepVersion:installed,hostVersion:'0.2.0-rc.2',platform:'win32-x64',fetcher});
 return {result,requested};
}
const legacy=()=>({row:{tag_name:'windows-alpha',draft:false,prerelease:true,published_at:'2026-09-21T00:00:00Z',html_url:base+'/tag/windows-alpha',assets:[]}});
test('mixed older manifests and legacy releases retain the verified comparison',async()=>{
 const {result}=await discover([release(1),release(2,'0.2.0-beta.1'),legacy()]);
 assert.equal(result.status,'metadata-partial');assert.equal(result.release,null);
 assert.deepEqual(result.coverage,{verifiedManifests:2,matchingPlatforms:2,missingManifests:1,manifestLimitReached:false});
});
test('metadata-only discovery never downloads a bundle',async()=>{
 const {result,requested}=await discover([release(1,'0.2.1-beta.1'),legacy()]);
 assert.equal(result.status,'available');assert.equal(result.release.sepVersion,'0.2.1-beta.1');
 assert.equal(result.release.version,'0.2.0-rc.2');assert.equal(result.coverage.missingManifests,1);
 assert.equal(requested.length,2);assert.ok(requested.every(url=>!url.endsWith('.zip')));
});
test('five verified manifests plus an unexamined sixth remain a partial comparison',async()=>{
 const {result,requested}=await discover(Array.from({length:6},(_,i)=>release(i+1)));
 assert.equal(result.status,'metadata-partial');assert.equal(result.release,null);
 assert.deepEqual(result.coverage,{verifiedManifests:5,matchingPlatforms:5,missingManifests:0,manifestLimitReached:true});
 assert.equal(requested.length,6);assert.ok(!requested.some(url=>url.endsWith('/6')));
});
test('exactly five manifests do not invent a download-limit warning',async()=>{
 const {result}=await discover(Array.from({length:5},(_,i)=>release(i+1)));
 assert.equal(result.status,'current');assert.equal(result.coverage.manifestLimitReached,false);
});
test('draft releases do not count as missing public metadata',async()=>{
 const item=legacy();item.row.draft=true;
 const {result}=await discover([release(1),item]);assert.equal(result.status,'current');assert.equal(result.coverage.missingManifests,0);
});
test('foreign-platform manifests cannot yield a current-platform update',async()=>{
 const {result}=await discover([release(1,'0.2.1-beta.1',{platform:'darwin-arm64'})]);
 assert.equal(result.status,'platform-unavailable');assert.equal(result.release,null);assert.equal(result.coverage.matchingPlatforms,0);
});
test('a verified newer candidate for another host still requires adaptation',async()=>{
 await assert.rejects(discover([release(1,'0.2.1-beta.1',{hostVersion:'0.2.0-rc.3'})]),/SEP_UPDATE_HOST_ADAPTATION_REQUIRED/);
});
test('stable installations do not opt into prerelease updates',async()=>{
 const {result}=await discover([release(1,'0.3.0-beta.1'),legacy()],{installed:'0.2.0'});
 assert.equal(result.release,null);assert.equal(result.status,'metadata-partial');
});
test('a changed manifest remains a failed check rather than partial information',async()=>{
 await assert.rejects(discover([release(1),legacy()],{mutateResponse:body=>body+' '}),/SEP_UPDATE_MANIFEST_CHANGED/);
});
test('invalid verified JSON metadata still rejects',async()=>{
 await assert.rejects(discover([release(1,'0.2.0-beta.2',{schema:2}),legacy()]),/SEP_UPDATE_MANIFEST_INVALID/);
});
test('permitted GitHub asset redirects preserve digest checks and comparison',async()=>{
 const {result}=await discover([release(1),legacy()],{redirect:true});assert.equal(result.status,'metadata-partial');assert.equal(result.coverage.verifiedManifests,1);
});
test('empty and unmanifested lists remain distinguishable',async()=>{
 assert.equal((await discover([])).result.status,'no-releases');
 assert.equal((await discover([legacy()])).result.status,'metadata-unavailable');
});
