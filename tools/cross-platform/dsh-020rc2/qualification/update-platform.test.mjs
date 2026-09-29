import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const {fetchSepRelease,SEP_RELEASES}=await import(pathToFileURL(join(process.env.SEP_NATIVE_SOURCE,'apps/desktop/src/sep-update/update-sep.mjs')));
const base='https://github.com/Lance-QwQ/DSH-SEP/releases';
function fixture(platform='win32-x64',hostVersion='0.2.0-rc.2') {
 const tag='v0.2.0-beta.4', name='DSH-SEP.zip';
 const manifest=JSON.stringify({schema:1,product:'dsh-sep',platform,sepVersion:'0.2.0-beta.4',hostVersion,bundle:{name,sha256:'a'.repeat(64),url:base+'/download/'+tag+'/'+name}});
 const release={tag_name:tag,draft:false,html_url:base+'/tag/'+tag,published_at:'2026-09-29T00:00:00Z',assets:[{id:1,name:'dsh-sep-update.json',digest:'sha256:'+createHash('sha256').update(manifest).digest('hex'),browser_download_url:base+'/download/'+tag+'/dsh-sep-update.json'}]};
 return {manifest,fetcher:async url=>new Response(url===SEP_RELEASES?JSON.stringify([release]):manifest)};
}
const options={installedSepVersion:'0.2.0-beta.3',hostVersion:'0.2.0-rc.2'};
for(const platform of ['win32-x64','linux-x64','darwin-arm64']) test('matching platform '+platform,async()=>{
 const found=await fetchSepRelease({...options,platform,...fixture(platform)});assert.equal(found.status,'available');assert.equal(found.release.platform,platform);
});
for(const platform of ['linux-x64','darwin-arm64']) test('Windows manifest cannot dispatch on '+platform,async()=>{
 const found=await fetchSepRelease({...options,platform,...fixture()});assert.equal(found.status,'platform-unavailable');assert.equal(found.release,null);
});
test('foreign host mismatch cannot shadow local platform',async()=>{const found=await fetchSepRelease({...options,platform:'darwin-arm64',...fixture('win32-x64','0.1.7-rc.2')});assert.equal(found.status,'platform-unavailable');});
test('matching platform still requires exact host',async()=>{await assert.rejects(()=>fetchSepRelease({...options,platform:'win32-x64',...fixture('win32-x64','0.1.7-rc.2')}),/SEP_UPDATE_HOST_ADAPTATION_REQUIRED/);});
test('invalid manifest platform remains rejected',async()=>{await assert.rejects(()=>fetchSepRelease({...options,platform:'linux-x64',...fixture('../../win32')}),/SEP_UPDATE_MANIFEST_INVALID/);});
test('invalid local platform rejected before network',async()=>{let calls=0;await assert.rejects(()=>fetchSepRelease({...options,platform:'unexpected',fetcher:()=>{calls++;throw Error('network')}}),/SEP_UPDATE_LOCAL_PLATFORM/);assert.equal(calls,0);});
