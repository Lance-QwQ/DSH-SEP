import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
const {createManagedUpdater}=await import(pathToFileURL(join(process.env.SEP_NATIVE_SOURCE,'apps/desktop/src/sep-update/update-desktop.mjs')));
test('foreign-platform release is unavailable and never queued or reported current',async()=>{
 const root=await mkdtemp(join(process.env.SEP_UPDATE_TEST_ROOT,'platform-ui-'));
 const projectDir=join(root,'project');await mkdir(join(projectDir,'node_modules/dsh-system-enhancement-package'),{recursive:true});
 await writeFile(join(projectDir,'node_modules/dsh-system-enhancement-package/package.json'),JSON.stringify({version:'0.2.0-beta.3'}));
 const base='https://github.com/Lance-QwQ/DSH-SEP/releases',tag='v0.2.0-beta.4',platform=process.platform==='win32'?'linux-x64':'win32-x64';
 const manifest=JSON.stringify({schema:1,product:'dsh-sep',platform,sepVersion:'0.2.0-beta.4',hostVersion:'0.2.0-rc.2',bundle:{name:'SEP.zip',sha256:'a'.repeat(64),url:base+'/download/'+tag+'/SEP.zip'}});
 const row={tag_name:tag,draft:false,html_url:base+'/tag/'+tag,published_at:'2026-09-29T00:00:00Z',assets:[{id:1,name:'dsh-sep-update.json',digest:'sha256:'+createHash('sha256').update(manifest).digest('hex'),browser_download_url:base+'/download/'+tag+'/dsh-sep-update.json'}]};
 const fetcher=async url=>new Response(url.includes('deepseek-ai/deepseek-harness')?'[]':url.includes('/assets/')?manifest:JSON.stringify([row]));
 const messages=[];let prepared=0;
 const service=createManagedUpdater({app:{getPath:()=>root,getVersion:()=> '0.2.0-rc.2'},dialog:{showMessageBox:async v=>{messages.push(v);return{response:0}}},BrowserWindow:class {constructor(){throw Error('NO_REVIEW_EXPECTED')}},powerMonitor:new EventEmitter,projectDir,nodeExecutable:process.execPath,fetcher,prepareSep:async()=>{prepared++}});
 try {await service.open();assert.equal(service.status().phase,'idle');assert.equal(service.sepStatus().phase,'candidate-unavailable');assert.equal(service.sepStatus().message,'SEP_UPDATE_PLATFORM_UNAVAILABLE');assert.equal(messages.length,0);await service.checkSep();assert.equal(messages.length,1);assert.match(messages[0].detail,/SEP_UPDATE_PLATFORM_UNAVAILABLE/);assert.equal(prepared,0);} finally {service.close();}
});
