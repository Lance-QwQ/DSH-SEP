// Explicit allowlisted binary exports, always to the real D: project root.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const mode=process.argv[2],out='D:/AIData/ProjectWork/DSH/alpha2-linux-closeout-20261013-r1';let distro,root,args,name,directory;
if(mode==='candidate'){distro='DSH-SEP-Linux-RC';root='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-package-r24-build';args=['-czf','-'];name='DSH-SEP-Linux-x64-Alpha2-closeout.1.tar.gz';}
else if(mode==='final-candidate'){distro='DSH-SEP-Linux-RC';root='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-package-r32-build';args=['-czf','-'];name='DSH-SEP-Linux-x64-Alpha2-closeout.2.tar.gz';}
else if(mode==='latest-candidate'){distro='DSH-SEP-Linux-RC';root='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-package-r40-build';args=['-czf','-'];name='DSH-SEP-Linux-x64-Alpha2-closeout.3.tar.gz';}
else if(mode==='evaluation'){distro='DSH-SEP-Eval';root='/opt/dsh-sep-eval/linux-closeout-final-r3';args=['-cf','-'];name='evaluation-evidence.tar';directory='evaluation-evidence';}
else if(mode==='evidence'){distro='DSH-SEP-Linux-RC';root='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-audit-r28';args=['-cf','-'];name='linux-evidence.tar';directory='linux-evidence';}
else if(mode==='final-evidence'){distro='DSH-SEP-Linux-RC';root='/opt/dsh-sep-cross-platform/alpha2-portable-closeout-audit-r43';args=['-cf','-'];name='linux-closeout-evidence.tar';directory='linux-closeout-evidence';}
else throw Error('EXPORT_SCOPE');
const files=mode.endsWith('candidate')?['payload','PACKAGE.json']:mode==='evaluation'?['sample/RESULT.json','sample/INPUTS.json','native-evaluation-exercise.mjs','linux-evaluation.mjs','linux-evaluation-paths.mjs']:['evidence'];
await mkdir(out,{recursive:true});const child=spawn('wsl.exe',['-d',distro,'-u',distro==='DSH-SEP-Eval'?'root':'sep-rc','--cd','/','--exec','/usr/bin/tar',...args,'-C',root,...files],{windowsHide:true,stdio:['ignore','pipe','inherit']}),ended=new Promise((r,j)=>{child.once('error',j);child.once('close',code=>code===0?r():j(Error('EXPORT_'+code)));});await Promise.all([pipeline(child.stdout,createWriteStream(out+'/'+name,{flags:'wx'})),ended]);
const h=createHash('sha256');for await(const b of createReadStream(out+'/'+name))h.update(b);const sha256=h.digest('hex');
if(directory){await mkdir(out+'/'+directory);await promisify(execFile)('C:/Windows/System32/tar.exe',['-xf',out+'/'+name,...mode.endsWith('evidence')?['--strip-components=1']:[],'-C',out+'/'+directory],{windowsHide:true,timeout:60000});}
const record={status:'pass',mode,archive:name,sha256,distro,sourceRoot:root,files};await writeFile(out+'/'+mode+'-export.json',JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record));
