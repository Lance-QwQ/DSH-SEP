import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash} from './derive.mjs';
const exec=promisify(execFile),here=fileURLToPath(new URL('.',import.meta.url));
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert(process.argv[2]);
for(const key of ['SEP_MAC_TREE_HELPER','SEP_MAC_ATTACHMENT_HELPER','SEP_OFFICIAL_HARNESS','SEP_MAC_BUNDLE_ROOT','SEP_PARSER_ASSEMBLY_FIXTURE'])assert(process.env[key]?.startsWith('/'),key);
const output=resolve(process.argv[2]);await mkdir(output,{mode:0o700});
const fixture=JSON.parse(await readFile(process.env.SEP_PARSER_ASSEMBLY_FIXTURE,'utf8'));assert(/^[a-f0-9]{64}$/.test(fixture.manifestSha256));
const checks=[];
for(const [file,label,count,real]of [['contracts.test.mjs','contracts',22,false],['vision.test.mjs','combined-vision-loader',7,true],['native.test.mjs','native-document-context',3,true],['standalone.test.mjs','combined-standalone',1,true]]){
 let result;const env={...process.env,SEP_DOCUMENT_BASELINE:'0',SEP_DOCUMENT_REAL_PARSER:real?'1':'0',SEP_DOCUMENT_TEST_ROOT:join(output,label)};
 try{result=await exec(process.execPath,['--test',join(here,file)],{env,timeout:240000,maxBuffer:4*1024*1024});}catch(error){result=error;}
 const stdout=String(result.stdout??''),stderr=String(result.stderr??'');await writeFile(join(output,label+'.stdout.log'),stdout,{flag:'wx'});await writeFile(join(output,label+'.stderr.log'),stderr,{flag:'wx'});
 const pass=result.code===undefined&&Object.entries({tests:count,pass:count,fail:0,skipped:0}).every(([key,value])=>new RegExp('\\b'+key+' '+value+'\\b').test(stdout));checks.push({label,status:pass?'pass':'fail',testsExpected:count,realParser:real});
}
const inputs=['derive.mjs','parsed-tools.mjs','context.mjs','consumers.mjs','runtime-source.mjs','runtime.mjs','profile-layout.mjs','standalone.mjs','startup-cleanup.mjs'];
const receipt={schema:1,status:checks.every(x=>x.status==='pass')?'pass':'fail',scope:'Combined native document/image/settings candidate; explicit context fixture only',parserManifestSha256:fixture.manifestSha256,checks,runtime:await Promise.all(inputs.map(async file=>({file,sha256:hash(await readFile(join(here,file)))}))),paidProviderCalls:0,defaultContextMounted:false,notVerified:['Full browser file-picker interaction','User paid provider endpoint','Other macOS versions or architectures','Default context snapshot generation']};
await writeFile(join(output,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));if(receipt.status!=='pass')throw Error('SEP_DOCUMENT_NATIVE_CANDIDATE_FAILED');
