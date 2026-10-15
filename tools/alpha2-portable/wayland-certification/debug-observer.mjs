// TEST ONLY: add read-only-observation CDP/accessibility flags to real Electron.
// No input events, dialog replacement, chooser/File stubs, or main replacement.
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {appendFileSync} from 'node:fs';
const path=process.env.SEP_WAYLAND_OBSERVATION;delete process.env.NODE_OPTIONS;
const save=value=>appendFileSync(path,JSON.stringify({...value,parent:process.pid})+'\n');
const original=cp.spawn;cp.spawn=function(executable,args,options){const observed=String(executable).endsWith('/electron/electron')&&args[0]?.endsWith('/desktop');if(observed)args=[...args,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--force-renderer-accessibility'];const c=original.call(this,executable,args,options);if(observed){save({kind:'electron',pid:c.pid,observationFlags:true});let text='';c.stderr.on('data',b=>{text=(text+b).slice(-4096);const m=text.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-z0-9-]+)/);if(m){save({kind:'cdp',pid:c.pid,url:m[1]});text='';}});c.once('close',(code,signal)=>save({kind:'exit',pid:c.pid,code,signal}));}return c;};syncBuiltinESMExports();
