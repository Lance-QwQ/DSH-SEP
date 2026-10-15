// Test-only owned owner/descendant processes; all PID identities are recorded.
import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import {writeSync} from 'node:fs';
const birth=async pid=>{const text=await readFile('/proc/'+pid+'/stat','utf8');return text.slice(text.lastIndexOf(')')+2).split(' ')[19];};
const child=spawn(process.execPath,['-e',`process.on('SIGTERM',()=>{${process.argv[2]==='stubborn'?'':'process.exit(0)'}});console.log('ready');setInterval(()=>{},1000)`],{detached:process.argv[3]==='escaped',stdio:['ignore','pipe','ignore']});
await new Promise(r=>child.stdout.once('data',r));child.stdout.destroy();console.log(JSON.stringify({owner:{pid:process.pid,birth:await birth(process.pid)},descendant:{pid:child.pid,birth:await birth(child.pid)}}));process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);
if(process.argv[4]==='notify')writeSync(Number(process.env.SEP_LINUX_OWNER_CONTROL_FD),'S');
