// Operator-only fixed Git capture. Does not read working-tree program bytes.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const SOURCE_COMMIT='930d081b1f7deb647948915432074f532eca2b62';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const prefixes=['bundle/lib/','bundle/host/','bundle/modules/system-enhancement-package/','bundle/modules/plugin-group/','bundle/modules/ui-settings-memory/','bundle/modules/context-preparation/','bundle/modules/trusted-evaluation-entry/','bundle/modules/tool-worker/','bundle/modules/session-migration/','bundle/modules/task-checkpoint/','bundle/licenses/'];
const allowed=path=>(prefixes.some(p=>path.startsWith(p))||['package.json','LICENSE','bundle/THIRD-PARTY-NOTICES.md'].includes(path))&&!/(?:^|\/)(?:tests?|__tests__|node_modules|\.git)(?:\/|$)/u.test(path)&&!/(?:\.map|\.d\.ts|\.test\.[^.]+|\.spec\.[^.]+)$/u.test(path);
// Reuse the reviewed Alpha.2 interface migration, not the Windows runtime.
export const alpha2Transforms={
 'bundle/host/p1-policy/index.js':[["import {z} from 'zod';","import {z} from 'zod';\nimport {startSuiteActivation} from './alpha2-subagent.js';",1],["ctx.subagents.start('spawn',","startSuiteActivation(ctx,",1],["const cwd=agent?.session?.header?.cwd;","const cwd=agent?.session&&ctx.get('workingDirectory').get(agent.session);",1]],
 'bundle/modules/system-enhancement-package/src/scope.js':[["const cwd = exec.agent?.session?.header?.cwd;","const cwd = this.recoveryOptions.workingDirectory?.get(exec.agent?.session);",1]],
 'bundle/host/plugin-group/index.mjs':[
 ["session?.header?.cwd??''","ctx.get('workingDirectory').get(session)??''",2],["session.header.cwd??''","ctx.get('workingDirectory').get(session)??''",1],["realpath(session.header.cwd)","realpath(ctx.get('workingDirectory').get(session))",3],["const cwd=exec?.agent?.session?.header?.cwd;","const cwd=exec?.agent?.session&&ctx.get('workingDirectory').get(exec.agent.session);",1],
 ["p=>cwd&&inside(p.root,cwd)","p=>cwd&&inside(p.root,cwd)&&isAbsolute(session.header.cwd??'')&&inside(p.root,session.header.cwd)",1],["p=>inside(p.root,cwd)","p=>inside(p.root,cwd)&&isAbsolute(session.header.cwd??'')&&inside(p.root,session.header.cwd)",2],["p=>inside(p.root,canonical)","p=>inside(p.root,canonical)&&isAbsolute(exec.agent.session.header.cwd??'')&&inside(p.root,exec.agent.session.header.cwd)",1],
 ],
};
export async function captureRuntime(repository,output){
 if(!isAbsolute(repository)||!isAbsolute(output)||resolve(output)!==output)fail('SEP_MAC_CAPTURE_PATH');
 const names=execFileSync('git',['-C',repository,'ls-tree','-r','--name-only',SOURCE_COMMIT,'--','bundle','package.json','LICENSE'],{encoding:'utf8'}).trim().split('\n').filter(allowed).sort();
 if(!names.length||names.some(p=>p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..')))fail('SEP_MAC_CAPTURE_INPUT');
 await mkdir(output,{mode:0o700});const inputs=[];
 const sourcePath='tools/alpha2-adaptation/alpha2-subagent.js',addedPath='bundle/host/p1-policy/alpha2-subagent.js';if(names.includes(addedPath))fail('SEP_MAC_CAPTURE_INPUT');names.push(addedPath);names.sort();
 for(const path of names){const originPath=path===addedPath?sourcePath:path,raw=execFileSync('git',['-C',repository,'show',SOURCE_COMMIT+':'+originPath],{maxBuffer:32*1024*1024}),transforms=alpha2Transforms[path]??[];let bytes=raw;
  if(transforms.length){let text=bytes.toString();for(const [before,after,count]of transforms){if(text.split(before).length-1!==count)fail('SEP_MAC_ALPHA2_ANCHOR');text=text.split(before).join(after);}bytes=Buffer.from(text);}
  await mkdir(join(output,path,'..'),{recursive:true,mode:0o700});await writeFile(join(output,path),bytes,{flag:'wx',mode:0o600});inputs.push({path,sha256:sha(bytes),bytes:bytes.length,sourcePath:originPath,sourceSha256:sha(raw),transformations:transforms.map(([before,after,count])=>({before,after,count}))});}
 const result={schema:1,sourceCommit:SOURCE_COMMIT,scope:'fixed owned SEP runtime source closure; optional consumers remain disabled until separately adapted',inputs};
 await writeFile(join(output,'CAPTURE.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return {files:inputs.length,sha256:sha(JSON.stringify(result))};
}
export async function verifyCapture(root){
 if(!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root)fail('SEP_MAC_CAPTURE_PATH');
 const manifest=JSON.parse(await readFile(join(root,'CAPTURE.json'),'utf8'));
 if(manifest.schema!==1||manifest.sourceCommit!==SOURCE_COMMIT||!Array.isArray(manifest.inputs)||!manifest.inputs.length)fail('SEP_MAC_CAPTURE_INPUT');
 const seen=new Set();for(const row of manifest.inputs){if(!allowed(row.path)||seen.has(row.path)||row.path.split('/').some(p=>!p||p==='.'||p==='..'))fail('SEP_MAC_CAPTURE_INPUT');seen.add(row.path);const path=join(root,row.path),s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size!==row.bytes||await realpath(path)!==path||sha(await readFile(path))!==row.sha256)fail('SEP_MAC_CAPTURE_CHANGED');}
 return manifest;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const [command,a,b]=process.argv.slice(2);console.log(JSON.stringify(command==='capture'?await captureRuntime(a,b):command==='verify'?{files:(await verifyCapture(a)).inputs.length}:fail('SEP_MAC_CAPTURE_COMMAND')));
}
