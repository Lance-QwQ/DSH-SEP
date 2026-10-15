// A fresh application draft, without an executable outer entry. Assembly and
// native integration must complete before this directory is an installable app.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,rename,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {verifyPackage} from './package-inventory.mjs';
import {deriveAppLayout} from './app-layout.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [baseArg,outArg]=process.argv.slice(2),base=await realpath(baseArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);
for(const p of [base,out])assert(p.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'non-launchable application layout draft',commands:[]};
const digest=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
async function copy(label,source,target){const r=await runOwnedCommand({file:'/usr/bin/ditto',args:[source,target],cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},logPath:join(out,label+'.log'),timeoutMs:300000});result.commands.push({label,...r,tail:undefined});assert.equal(r.status,'pass');}
try{
 const restored=JSON.parse(await readFile(join(base,'RESULT.json'),'utf8'));assert.equal(restored.status,'pass');assert.equal(restored.source.artifactId,11891016729);
 const source=join(base,'restored/DSH-SEP-macOS-Alpha2-preview');assert.equal(restored.packageRoot,source);assert.equal(await realpath(source),source);
 const inventory=JSON.parse(await readFile(join(base,'previous-evidence/PACKAGE-INVENTORY.json'),'utf8'));assert.equal(inventory.treeSha256,'59ede7a177436158cef44412d26a5063d5c3463fba04635b5891f7cb2928a83d');await verifyPackage(source,inventory);
 assert.equal(await digest(join(source,'PROGRAM.json')),'172e7fd05b6da4fef28d210846f28f674e684283621473c0458d5e9b2d26164f');
 const old=JSON.parse(await readFile(join(source,'PROGRAM.json'),'utf8')),draft=deriveAppLayout(old),app=join(out,'DSH SEP.app'),contents=join(app,'Contents');
 for(const dir of ['MacOS','Helpers','Resources/product'])await mkdir(join(contents,dir),{recursive:true,mode:0o755});
 await copy('copy-controlled-desktop',join(source,old.appRoot),join(contents,draft.appRoot));
 await copy('copy-program-payload',join(source,'payload'),join(contents,'Resources/product/payload'));
 await rename(join(contents,'Resources/product/payload/mac'),join(contents,'Resources/product/runtime'));
 for(const [role,entry]of Object.entries(draft.entries)){assert((await lstat(join(contents,entry.path))).isFile());assert.equal(await digest(join(contents,entry.path)),old.entries[role].sha256);}
 // Program and bootstrap manifests are intentionally not emitted here: later
 // code derivation and signing change hashes. This plan cannot authorize launch.
 result.status='pass';result.app=app;result.contents=contents;result.programPlan=draft;result.inputProgramSha256=restored.source.programSha256;result.notVerified=['runtime updates','renderer and product control integration','outer entry','final signatures','native application lifecycle'];
}catch(e){result.code=/^[A-Z][A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_MAC_APP_STAGE_FAILED';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'APP-DRAFT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,scope:result.scope}));}
