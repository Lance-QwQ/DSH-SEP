// Real SQLite/native-helper orchestration; SEP_POSIX_TEST runs are not APFS certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from './transaction-store.mjs';
const base=process.env.SEP_MAC_TRANSACTION_TEST_ROOT,helperPath=process.env.SEP_MAC_TREE_HELPER;
assert(base&&helperPath,'explicit isolated root and actual native helper required');
await mkdir(base,{recursive:true,mode:0o700});
const hash=b=>createHash('sha256').update(b).digest('hex');
const helperSha256=hash(await readFile(helperPath));
test('recovery cannot report pass when durable pending state reappears before its final readback',async()=>{
 const parent=await mkdtemp(join(base,'recovery-result-')),root=join(parent,'managed'),source=join(parent,'source');
 await mkdir(root,{mode:0o700});await mkdir(source,{mode:0o700});await writeFile(join(source,'a.txt'),'original',{mode:0o600});
 const io=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')}),signal=new AbortController();
 let first,reopened;
 try{
  first=await openTrustedProject({root,source,io,onEvent:name=>{if(name==='health-passed')signal.abort();}});
  const plan=await first.planWrite({path:'a.txt',expectedSha256:hash('original'),text:'uncommitted'});
  await assert.rejects(first.commit({planHash:plan.planHash,signal:signal.signal}),{code:'SEP_PROJECT_CANCELLED'});
  await first.close();first=undefined;
  let injected=false;
  reopened=await openTrustedProject({root,source,io,onEvent:name=>{
   if(name!=='rollback-durable')return;
   // Synthetic durable-state fault at the existing operation boundary.
   const db=new DatabaseSync(join(root,'state.sqlite'));
   try{const meta=JSON.parse(db.prepare('SELECT value FROM metadata WHERE id=1').get().value);meta.pending='unverified-intent';db.prepare('UPDATE metadata SET value=? WHERE id=1').run(JSON.stringify(meta));injected=true;}finally{db.close();}
  }});
  await assert.rejects(reopened.recover(),{code:'SEP_PROJECT_RECOVERY_BLOCKED'});
  assert.equal(injected,true);
  await assert.rejects(reopened.current(),{code:'SEP_PROJECT_RECOVERY_REQUIRED'});
  assert.equal(await readFile(join(source,'a.txt'),'utf8'),'original');
 }finally{await reopened?.close();await first?.close();}
});
