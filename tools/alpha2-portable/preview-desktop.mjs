import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const file='/opt/dsh-sep-cross-platform/alpha2-portable-desktop-workspace-r13/desktop-final-r1/desktop-probe.jsonl.png';
const bytes=execFileSync('wsl.exe',['--distribution','DSH-SEP-Linux-RC','--cd','/','--exec','/bin/cat',file],{windowsHide:true,stdio:['ignore','pipe','inherit'],maxBuffer:4194304});
await writeFile('D:/AIData/ProjectWork/DSH/alpha2-portable-profile-20261012-r1/preview-r13.png',bytes,{flag:'wx'});
