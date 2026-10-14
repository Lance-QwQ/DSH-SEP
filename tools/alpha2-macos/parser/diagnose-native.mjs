// Synthetic CI-only diagnostics. This file is not a parser API or a model tool.
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createParserWorker} from './parser-worker.mjs';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8')),exec=promisify(execFile),base=await mkdtemp(join(fixture.output,'diagnostic-')),reports=[];
for(const [name,args,stdin]of [
 ['node-start',['-e','console.log(JSON.stringify({version:process.version,platform:process.platform}))'],''],
 ['node-text',[fixture['document-node'].parserPath],JSON.stringify({bytes:Buffer.from('synthetic body').toString('base64'),extension:'.txt'})],
 ['node-bad-pdf',[fixture['document-node'].parserPath],JSON.stringify({bytes:Buffer.from('not pdf').toString('base64'),extension:'.pdf'})],
]){
 const root=join(base,name),workRoot=join(root,'work'),authorityRoot=join(root,'authority');await mkdir(root,{mode:0o700});await mkdir(workRoot,{mode:0o700});await mkdir(authorityRoot,{mode:0o700});
 const io=createProjectTree({helperPath:fixture.helperPath,helperSha256:fixture.helperSha256,lockPath:join(authorityRoot,'.native.lock')}),binary=fixture['document-node'];
 let direct;if(name==='node-start'){try{const r=await exec(binary.executable,args,{env:{PATH:'/usr/bin:/bin',HOME:workRoot,TMPDIR:workRoot,LANG:'C',LC_ALL:'C'},timeout:5000,maxBuffer:4096});direct={status:'pass',stdout:r.stdout,stderr:r.stderr};}catch(e){direct={status:'fail',code:e.code,signal:e.signal,stdout:e.stdout,stderr:e.stderr};}}
 try{const worker=await createParserWorker({workRoot,authorityRoot,runtimeRoot:fixture.runtimeRoot,ownerPath:fixture.ownerPath,ownerSha256:fixture.ownerSha256,executable:binary.executable,executableSha256:binary.executableSha256},io),receipt=await worker.run({args,stdin,mode:'single',timeoutMs:5000,maxOutputBytes:32768});reports.push({name,direct,receipt,state:worker.status()});}catch(e){reports.push({name,direct,error:{code:e.code,name:e.name}});}
}
await writeFile(join(fixture.output,'native-diagnostic.json'),JSON.stringify(reports,null,2)+'\n',{flag:'wx'});
