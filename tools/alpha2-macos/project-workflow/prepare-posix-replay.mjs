// Test operator: fixed synthetic Linux replay, never a Mac production override.
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex'),here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..'),out=process.argv[2];
assert(out&&isAbsolute(out)&&resolve(out)===out);assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const baseline=JSON.parse(await readFile(join(here,'SOURCE_INPUTS.json'),'utf8'));
const extra=['native-fixture.mjs','native-workflow.test.mjs','workflow-adapter.mjs','preview.mjs','project-factory.mjs','derive-sources.mjs','derived-transaction-store.mjs','derived-lifecycle.mjs','READONLY-ORIGIN.json','SOURCE_INPUTS.json'];
const inputs=[];
for(const relative of [...baseline.inputs.map(i=>i.path),...extra.map(p=>'project-workflow/'+p)]){
 const bytes=await readFile(join(root,relative)),old=baseline.inputs.find(i=>i.path===relative);if(old)assert.equal(sha(bytes),old.sha256);
 const dest=join(out,relative);await mkdir(dirname(dest),{recursive:true,mode:0o700});await writeFile(dest,bytes,{flag:'wx',mode:0o600});inputs.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
}
let fixture=await readFile(join(here,'native-fixture.mjs'),'utf8'),test=await readFile(join(here,'native-workflow.test.mjs'),'utf8');
assert.equal(sha(test),'a9cd12ce226cf53e3a72e94b0a6f6de1384c99b44d836f788248518a5277ec8a');
const transforms=[
 {file:'fixture',before:"import {openWorkflowProject as openMacManagedProject} from './project-factory.mjs';",after:"import {verifyWorkflowDerivation} from './project-factory.mjs';\nimport {openTrustedProject} from './derived-transaction-store.mjs';\nimport {createProjectTree} from '../apfs-tree/project-tree.mjs';\nasync function openMacManagedProject(input) { await verifyWorkflowDerivation(); return openTrustedProject({...input,io:createProjectTree({helperPath:input.helperPath,helperSha256:input.helperSha256,lockPath:join(input.root,'.native.lock')})}); }"},
 {file:'fixture',before:"if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('SEP_MAC_NATIVE_REQUIRED');",after:"if (process.platform !== 'linux') fail('SEP_MAC_POSIX_REPLAY_REQUIRED');"},
 {file:'test',before:"from './native-fixture.mjs';",after:"from './posix-native-fixture.mjs';"}
];
const original={fixture:sha(fixture),test:sha(test)};
for(const t of transforms){const value=t.file==='fixture'?fixture:test;assert.equal(value.split(t.before).length,2);if(t.file==='fixture')fixture=value.replace(t.before,t.after);else test=value.replace(t.before,t.after);}
for(const [name,bytes]of [['posix-native-fixture.mjs',Buffer.from(fixture)],['posix-workflow.test.mjs',Buffer.from(test)]]){await writeFile(join(out,'project-workflow',name),bytes,{flag:'wx',mode:0o600});inputs.push({path:'project-workflow/'+name,bytes:bytes.length,sha256:sha(bytes)});}
await writeFile(join(out,'POSIX-REPLAY.json'),JSON.stringify({schema:1,scope:'test-only Linux replay; not APFS or Mac production acceptance',original,result:{fixture:sha(fixture),test:sha(test)},transforms,inputs},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({scope:'posix-test-source-only',files:inputs.length,manifestSha256:sha(await readFile(join(out,'POSIX-REPLAY.json')))}));
