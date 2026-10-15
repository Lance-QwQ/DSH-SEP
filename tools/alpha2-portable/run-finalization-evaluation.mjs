import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream,openSync,closeSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {readFile} from 'node:fs/promises';
const out='D:/AIData/ProjectWork/DSH/alpha2-linux-finalization-20261013-r1',driver='/opt/dsh-sep-eval/linux-finalization-controls-driver-r6',carrier='/opt/dsh-sep-cross-platform/alpha2-portable-finalization-eval-carrier-r6',sample='/opt/dsh-sep-eval/linux-finalization-controls-r6';
const prior='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-evaluation-inputs-r1',frozen=prior+'/alpha2-portable-20261012-r1',node=prior+'/runtime/bin/node';
const wait=c=>new Promise((r,j)=>{c.once('error',j);c.once('close',code=>code===0?r():j(Error('COMMAND_EXIT_'+code)));});
async function recv(file,root){const c=spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--exec','/bin/sh','-c','umask 077; mkdir "$1" && exec tar -xf - -C "$1"','receive',root],{windowsHide:true,stdio:['pipe','inherit','inherit']});await Promise.all([pipeline(createReadStream(file),c.stdin),wait(c)]);}
await recv(out+'/evaluation-driver-r6.tar',driver);
const c=spawn('wsl.exe',['-d','DSH-SEP-Linux-RC','-u','sep-rc','--cd','/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1','--exec','tar','-cf','-','sandbox-runtime'],{windowsHide:true,stdio:['ignore','pipe','inherit']});await Promise.all([pipeline(c.stdout,createWriteStream(out+'/evaluation-sandbox-r6.tar',{flags:'wx'})),wait(c)]);await recv(out+'/evaluation-sandbox-r6.tar',carrier);
await wait(spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--exec','/bin/sh','-c','ln -s "$1/host" "$2/host" && mkdir -m 700 "$3/samples"','prepare',frozen,carrier,driver],{windowsHide:true,stdio:'inherit'}));
await wait(spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--cd',driver,'--exec','/opt/dsh-sep-eval/swebench-venv/bin/python','-B','prepare-evaluation-controls.py',sample,frozen+'/host/node_modules/dsh-sep-bundle'],{windowsHide:true,stdio:'inherit'}));
const log=openSync(out+'/evaluation-controls-r6.log','wx');try{await wait(spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--cd',driver,'--exec','/usr/bin/env','SEP_PORTABLE_ROOT='+carrier,'SEP_BUNDLE_TEST_ROOT='+driver+'/samples','SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71',node,'exercise-evaluation-controls.mjs',sample],{windowsHide:true,stdio:['ignore',log,log]}));}finally{closeSync(log);}console.log(await readFile(out+'/evaluation-controls-r6.log','utf8'));
