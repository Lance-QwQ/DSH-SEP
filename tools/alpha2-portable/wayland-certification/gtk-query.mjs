// Synthetic test diagnostics only. Native D-Bus read; never model-facing.
import {spawn} from 'node:child_process';
export async function queryGtk(owner,env,operation='observe',args={}){
 const child=spawn('/usr/bin/python3',['-I','-B',new URL('./gtk-observation.py',import.meta.url).pathname],{env,stdio:['pipe','pipe','pipe']}),out=[],err=[];
 child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.stdin.end(JSON.stringify({owner,operation,arguments:args}));
 let timer;try{return await Promise.race([new Promise((r,j)=>{child.once('error',j);child.once('close',code=>r({code,stdout:Buffer.concat(out).toString(),stderr:Buffer.concat(err).toString()}));}),new Promise((_,j)=>{timer=setTimeout(()=>{child.kill('SIGKILL');j(Error('GTK_OBSERVATION_DEADLINE'));},15000);})]);}finally{clearTimeout(timer);}
}
