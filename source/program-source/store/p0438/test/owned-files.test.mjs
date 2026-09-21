import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, lstat, rename, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeOwnedOutput } from '../owned-files.js';
test('failed conversion cleanup never removes a replacement caller file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sep-owned-output-')),output=join(root,'out.pdf');await writeFile(output,'owned');const identity=await lstat(output,{bigint:true});await rename(output,join(root,'old.pdf'));await writeFile(output,'replacement');
  await assert.rejects(removeOwnedOutput(output,identity),e=>e.cleanupIncomplete===true);assert.equal(await readFile(output,'utf8'),'replacement');
});
test('failed conversion cleanup removes only its own file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sep-owned-output-')),output=join(root,'out.pdf');await writeFile(output,'owned');const identity=await lstat(output,{bigint:true});await removeOwnedOutput(output,identity);await assert.rejects(access(output),e=>e.code==='ENOENT');await removeOwnedOutput(output,identity);
});
