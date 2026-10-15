// Operator support only. These functions do not weaken production manifests.
import assert from 'node:assert/strict';
import {readFile,realpath,mkdir,writeFile,lstat} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyPackage,inventoryPackage} from '../package/package-inventory.mjs';
import {loadProgram,relativeProgramPath} from '../desktop/managed-broker/program-manifest.mjs';
import {EXTRA_RUNTIME,RUNTIME_REPLACEMENT} from '../desktop/project-workflow-product/pending-startup/package-inputs.mjs';
import {validateRuntimeReceipt} from './application-contract.mjs';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const fixed=Object.freeze({commit:'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a',program:'fbe989745254464885c390b7d6e55fd3883674faa26b705ea74833240c07d713',tree:'128885968401b628b2c21974d045a70a04233bc04a0bfd3aa943eba1ce4e5ebd'});
export const operatorSource=fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,'');
export async function outputDirectory(value){const temp=await realpath(process.env.RUNNER_TEMP),out=resolve(value);assert(out.startsWith(temp+sep),'SEP_NATIVE_OUTPUT_SCOPE');assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});return out;}
export async function save(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function runtimeRows(source){
 assert.equal(await realpath(source),await realpath(operatorSource),'SEP_NATIVE_SOURCE_SCOPE');const old=[];
 for(const name of ['runtime-inputs.json','image-runtime-inputs.json','document-runtime-inputs.json','product-runtime-inputs.json']){const value=JSON.parse(await readFile(join(source,'package',name)));assert.equal(value.schema,1);old.push(...value.files);}
 assert.equal(old.length,58);assert.equal(EXTRA_RUNTIME.length,26);
 const rows=[...old.map(path=>({path,source:path===RUNTIME_REPLACEMENT.target?RUNTIME_REPLACEMENT.source:path})),...EXTRA_RUNTIME.map(path=>({path,source:path}))];
 for(const row of rows){relativeProgramPath(row.path);relativeProgramPath(row.source);const path=join(source,row.source),st=await lstat(path);assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1);assert.equal(await realpath(path),path);row.sha256=hash(await readFile(path));}
 validateRuntimeReceipt(rows,rows);return rows;
}
export async function applicationEnvironment(mode,root,source){
 assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert(['fixed','built'].includes(mode));const temp=await realpath(process.env.RUNNER_TEMP);root=await realpath(root);assert(root.startsWith(temp+sep));
 const resultBytes=await readFile(join(root,'RESULT.json')),result=JSON.parse(resultBytes),inventory=JSON.parse(await readFile(join(root,'PACKAGE-INVENTORY.json'))),application=join(root,'restored','DSH SEP.app');
 assert.equal(result.status,'pass');assert.equal(result.restoredApplication,application);assert.equal(inventory.treeSha256,mode==='fixed'?fixed.tree:result.treeSha256);
 if(mode==='fixed'){assert.equal(result.source.commit,fixed.commit);}else{assert.equal(result.schema,1);assert.equal(result.sourceCommit,process.env.GITHUB_SHA);assert.equal(result.originalUnchanged,true);validateRuntimeReceipt(result.runtime,await runtimeRows(source));}
 await verifyPackage(application,inventory);const programSha256=mode==='fixed'?fixed.program:result.programSha256,p=await loadProgram(join(application,'Contents/Resources/PROGRAM.json'),programSha256);
 if(mode==='built')for(const row of result.runtime){const record=inventory.entries.find(e=>e.path==='Contents/Resources/product/runtime/'+row.path);assert.equal(record?.sha256,row.sha256,'SEP_NATIVE_INSTALLED_RUNTIME');}
 return{root,result,resultSha256:hash(resultBytes),inventory,application,p,programSha256};
}
export async function writeEnvironment(context,out){const {p}=context,parser=join(out,'parser-fixture.json');await save(parser,{runtimeRoot:p.parserRoot,manifestSha256:p.entries.parserManifest.sha256});const env={SEP_OFFICIAL_HARNESS:p.hostRoot,SEP_MAC_BUNDLE_ROOT:p.bundleRoot,SEP_MAC_TREE_HELPER:p.entries.helper.path,SEP_MAC_ATTACHMENT_HELPER:p.entries.attachmentHelper.path,SEP_PARSER_ASSEMBLY_FIXTURE:parser};await save(join(out,'ENV.json'),env);return env;}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){assert.equal(process.argv.length,4);const out=await outputDirectory(process.argv[3]),context=await applicationEnvironment('fixed',process.argv[2],operatorSource);await writeEnvironment(context,out);await save(join(out,'RESULT.json'),{schema:1,status:'pass',scope:'fixed r44 native dependency paths only',programSha256:context.programSha256,resultSha256:context.resultSha256});console.log(JSON.stringify({status:'pass',environment:join(out,'ENV.json')}));}
