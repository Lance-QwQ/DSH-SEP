import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const [installation,root]=process.argv.slice(2);assert(installation==='/opt/dsh-sep-cross-platform/alpha2-portable-finalization-installed-r34');assert(root==='/opt/dsh-sep-cross-platform/alpha2-portable-finalization-actual-continuation-r40');process.umask(0o077);await mkdir(root,{mode:0o700});
const cases=[['gui','exercise-installed-desktop.mjs'],['host','exercise-validation-boundary.mjs','host-crash'],['wayland','exercise-validation-boundary.mjs','wayland'],['stopped','exercise-supervision.mjs','stopped-node'],['host-hang','exercise-supervision.mjs','host-hang'],['active','exercise-supervision.mjs','active-both']],rows=[];
for(const [name,script,mode]of cases){await writeFile(join(root,'PROGRESS.json'),JSON.stringify({status:'running',current:name,completed:rows},null,2)+'\n');console.log(JSON.stringify({starting:name}));try{
 const r=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./'+script,import.meta.url)),installation,join(root,name),...mode?[mode]:[]],{env:process.env,timeout:180000,maxBuffer:1048576});await writeFile(join(root,name+'.stdout.log'),r.stdout);await writeFile(join(root,name+'.stderr.log'),r.stderr);const result=JSON.parse(await readFile(join(root,name,'RESULT.json')));assert.equal(result.status,'pass');rows.push({name,status:'pass',rounds:(result.rounds??result.rows).length});console.log(JSON.stringify(rows.at(-1)));
}catch(e){await writeFile(join(root,name+'.failure.log'),String(e.stdout??'')+'\n'+String(e.stderr??'')+'\n'+String(e.message));rows.push({name,status:'fail',code:e.code??e.name});process.exitCode=1;break;}}
const result={status:rows.length===cases.length&&rows.every(r=>r.status==='pass')?'pass':'fail',rows};await writeFile(join(root,'PROGRESS.json'),JSON.stringify(result,null,2)+'\n');await writeFile(join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
