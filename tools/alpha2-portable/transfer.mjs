import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
const [tar,destination]=process.argv.slice(2);
if(!/^\/opt\/dsh-sep-cross-platform\/alpha2-portable-[a-z0-9-]+$/.test(destination))throw Error('DESTINATION_SCOPE');
const child=spawn('wsl.exe',['--distribution','DSH-SEP-Linux-RC','--user','sep-rc','--cd','/','--exec','/bin/sh','-c','umask 077; mkdir "$1" && exec tar -xpf - -C "$1"','transfer',destination],{windowsHide:true,stdio:['pipe','inherit','inherit']});
const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(Error('WSL_TRANSFER:'+code+':'+signal)));});
await Promise.all([pipeline(createReadStream(tar),child.stdin),exited]);
console.log(JSON.stringify({transferred:destination}));
