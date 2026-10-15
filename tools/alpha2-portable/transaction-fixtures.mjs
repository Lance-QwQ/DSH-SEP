import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
export const carrierRoot=resolve(process.env.SEP_PORTABLE_ROOT);
export const outputRoot=resolve(process.env.SEP_BUNDLE_TEST_ROOT);
export const isolation={bwrap:join(carrierRoot,'sandbox-runtime/usr/bin/bwrap'),binarySha256:process.env.SEP_BWRAP_SHA256};
export async function fixture(){
 const base=await mkdtemp(join(outputRoot,'transactions-'));
 const source=join(base,'source'),root=join(base,'managed');
 await mkdir(source,{mode:0o700});await mkdir(root,{mode:0o700});
 await mkdir(join(source,'中文目录'),{mode:0o700});
 await writeFile(join(source,'data.txt'),'original');await writeFile(join(source,'中文目录','note.txt'),'保留');
 return {base,source,root,isolation};
}
export async function openFixture(extra={}){
 const {openManagedProject}=await import('./managed-project.mjs').catch(()=>({}));
 assert.equal(typeof openManagedProject,'function','controlled project transactions are implemented');
 const f=await fixture(),project=await openManagedProject({...f,...extra});return {...f,project,openManagedProject};
}
export const edit=(text='candidate')=>['/usr/bin/python3','-c',`open('/work/data.txt','w').write(${JSON.stringify(text)})`];
export async function text(project){return readFile(join((await project.current()).path,'data.txt'),'utf8');}
export async function crash(f,phase,operation='commit'){
 const child=spawn(process.execPath,[new URL('./transaction-worker.mjs',import.meta.url).pathname,JSON.stringify({root:f.root,isolation,phase,operation})],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',x=>stderr+=x);
 const ended=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 assert.equal(ended.signal,'SIGKILL',stderr);return ended;
}
