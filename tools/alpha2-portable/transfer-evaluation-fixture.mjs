// Binary-only transfer of already frozen public program inputs into a NEW
// isolated directory in the existing evaluation distro. No old state is copied.
import {spawn} from 'node:child_process';
import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
const out='D:/AIData/ProjectWork/DSH/alpha2-linux-closeout-20261013-r1';await mkdir(out,{recursive:true});
const archive=out+'/evaluation-inputs.tar.gz',target='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-evaluation-inputs-r1';
const wait=c=>new Promise((r,j)=>{c.once('error',j);c.once('close',code=>code===0?r():j(Error('TRANSFER_EXIT_'+code)));});
const send=spawn('wsl.exe',['-d','DSH-SEP-Linux-RC','-u','sep-rc','--cd','/opt/dsh-sep-cross-platform','--exec','tar','-czf','-','alpha2-portable-20261012-r1/host','runtime/bin/node'],{windowsHide:true,stdio:['ignore','pipe','inherit']});
await Promise.all([pipeline(send.stdout,createWriteStream(archive,{flags:'wx'})),wait(send)]);
const recv=spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--exec','/bin/sh','-c','umask 077; mkdir -p /opt/dsh-sep-cross-platform; mkdir "$1" && exec tar -xzf - -C "$1"','transfer',target],{windowsHide:true,stdio:['pipe','inherit','inherit']});
await Promise.all([pipeline(createReadStream(archive),recv.stdin),wait(recv)]);console.log(JSON.stringify({archive,target,scope:'public frozen program inputs only; no historical backend state'}));
