// Export, hash, re-extract, then use the actual archive's installer.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
const out='D:/AIData/ProjectWork/DSH/alpha2-linux-finalization-20261013-r1',build='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-package-finalization-r7-build',input='/opt/dsh-sep-cross-platform/alpha2-portable-finalization-archive-r8',installation='/opt/dsh-sep-cross-platform/alpha2-portable-finalization-installed-r9',name='DSH-SEP-Linux-x64-Alpha2-closeout.8.tar.gz';
const wait=c=>new Promise((r,j)=>{c.once('error',j);c.once('close',n=>n===0?r():j(Error('PACKAGE_COMMAND_'+n)));});
const c=spawn('wsl.exe',['-d','DSH-SEP-Linux-RC','-u','sep-rc','--exec','tar','-czf','-','-C',build,'payload','PACKAGE.json'],{windowsHide:true,stdio:['ignore','pipe','inherit']});await Promise.all([pipeline(c.stdout,createWriteStream(out+'/'+name,{flags:'wx'})),wait(c)]);
const h=createHash('sha256');for await(const b of createReadStream(out+'/'+name))h.update(b);const sha256=h.digest('hex');
await writeFile(out+'/candidate-export.json',JSON.stringify({status:'pass',name,sha256,build,input,installation},null,2)+'\n',{flag:'wx'});await writeFile(out+'/'+name+'.sha256',sha256+'  '+name+'\n',{flag:'wx'});
const r=spawn('wsl.exe',['-d','DSH-SEP-Linux-RC','-u','sep-rc','--exec','/bin/sh','-c','umask 077; mkdir "$1" && exec tar -xzpf - -C "$1"','unpack',input],{windowsHide:true,stdio:['pipe','inherit','inherit']});await Promise.all([pipeline(createReadStream(out+'/'+name),r.stdin),wait(r)]);
await wait(spawn('wsl.exe',['-d','DSH-SEP-Linux-RC','-u','sep-rc','--cd','/opt/dsh-sep-cross-platform/alpha2-portable-finalization-driver-r10','--exec','/opt/dsh-sep-cross-platform/runtime/bin/node','install-finalization.mjs',input,installation],{windowsHide:true,stdio:'inherit'}));console.log(JSON.stringify({status:'pass',name,sha256}));
