import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
export async function withPrivateDisplay(root,work){
 const assets='/opt/dsh-sep-cross-platform/alpha2-desktop-assets-20261013-r1/xserver',auth=join(root,'Xauthority'),field=b=>{b=Buffer.from(b);const length=Buffer.alloc(2);length.writeUInt16BE(b.length);return Buffer.concat([length,b]);};
 await writeFile(auth,Buffer.concat([Buffer.from([255,255]),field(''),field(''),field('MIT-MAGIC-COOKIE-1'),field(randomBytes(16))]),{mode:0o600,flag:'wx'});const tmp=join(root,'xserver-tmp');await mkdir(tmp,{mode:0o700});
 const child=spawn(join(process.env.SEP_PORTABLE_ROOT,'sandbox-runtime/usr/bin/bwrap'),['--die-with-parent','--ro-bind','/','/','--ro-bind',join(assets,'usr/bin'),'/usr/bin','--bind',tmp,'/tmp','--',join(assets,'usr/bin/Xvfb'),'-displayfd','3','-screen','0','1280x900x24','-nolisten','tcp','-auth',auth],{env:{PATH:'/usr/bin',LD_LIBRARY_PATH:join(assets,'usr/lib/x86_64-linux-gnu')},stdio:['ignore','pipe','pipe','pipe']});
 child.stdout.on('data',b=>appendFileSync(join(root,'xserver.stdout.log'),b));child.stderr.on('data',b=>appendFileSync(join(root,'xserver.stderr.log'),b));let exit;const ended=new Promise((r,j)=>{child.once('error',j);child.once('close',(code,signal)=>{exit={code,signal};r(exit);});});
 try{const selected=String(await Promise.race([new Promise(r=>child.stdio[3].once('data',r)),ended.then(()=>{throw Error('XSERVER_START_FAILED');}),delay(5000,undefined,{ref:false}).then(()=>{throw Error('XSERVER_START_DEADLINE');})])).trim();if(!/^\d+$/.test(selected))throw Error('DISPLAY_ID_INVALID');process.env.DISPLAY=':'+selected;process.env.XAUTHORITY=auth;delete process.env.WAYLAND_DISPLAY;process.env.GDK_BACKEND='x11';return await work();}
 finally{if(!exit){child.kill('SIGTERM');await Promise.race([ended,delay(2000)]);if(!exit){child.kill('SIGKILL');await ended;}}await writeFile(join(root,'XSERVER-RESULT.json'),JSON.stringify({pid:child.pid,exit,scope:'private authenticated Xorg; outer owner explicitly stopped server'})+'\n',{flag:'wx'});}
}
