import {spawn} from 'node:child_process';
import {createReadStream,openSync,closeSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
const tag=process.argv[2];if(!/^[a-z0-9-]+$/.test(tag??''))throw Error('TAG');
const out='D:/AIData/ProjectWork/DSH/alpha2-linux-closeout-20261013-r1',source=fileURLToPath(new URL('.',import.meta.url)),archive=out+'/native-evaluation-'+tag+'.tar',base='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-evaluation-inputs-r1',target='/opt/dsh-sep-eval/linux-closeout-'+tag;
await mkdir(out,{recursive:true});const wait=c=>new Promise((r,j)=>{c.once('error',j);c.once('close',code=>code===0?r():j(Error('EVAL_COMMAND_EXIT_'+code)));});
await wait(spawn('C:/Windows/System32/tar.exe',['-cf',archive,'-C',source,'.'],{windowsHide:true,stdio:'inherit'}));
const recv=spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--exec','/bin/sh','-c','umask 077; mkdir "$1" && exec tar -xf - -C "$1"','transfer',target],{windowsHide:true,stdio:['pipe','inherit','inherit']});await Promise.all([pipeline(createReadStream(archive),recv.stdin),wait(recv)]);
const program=base+'/alpha2-portable-20261012-r1',bundle=program+'/host/node_modules/dsh-sep-bundle';
await wait(spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--cd',target,'--exec','/opt/dsh-sep-eval/swebench-venv/bin/python','-B','prepare-native-evaluation.py',target+'/sample',bundle],{windowsHide:true,stdio:'inherit'}));
const log=openSync(out+'/native-evaluation-'+tag+'.log','wx');try{await wait(spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--cd',target,'--exec','/usr/bin/env','SEP_PORTABLE_ROOT='+program,'SEP_NATIVE_EVAL_ROOT='+target+'/sample',base+'/runtime/bin/node','native-evaluation-exercise.mjs'],{windowsHide:true,stdio:['ignore',log,log]}));}finally{closeSync(log);}
console.log(await readFile(out+'/native-evaluation-'+tag+'.log','utf8'));
