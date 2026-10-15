import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {previewPlan} from './preview.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.ok(process.env.SEP_MAC_WORKFLOW_UNIT_ROOT, 'explicit synthetic output root required');
const root = resolve(process.env.SEP_MAC_WORKFLOW_UNIT_ROOT); await mkdir(root, {recursive:true});
async function fixture(before, after) {
  const base = await mkdtemp(join(root, 'preview-')), left = join(base, 'before'), right = join(base, 'after');
  await mkdir(left); await mkdir(right);
  const entries = async (path, data) => {
    if (data === null) return [];
    const bytes = Buffer.from(data); await writeFile(join(path, 'a.txt'), bytes);
    return [{path:'a.txt', kind:'file', size:bytes.length, sha256:sha(bytes)}];
  };
  return {before:{path:left, entries:await entries(left,before)}, after:{path:right, entries:await entries(right,after)}, changes:[{path:'a.txt',kind:before===null?'created':after===null?'deleted':'modified'}], signal:new AbortController().signal};
}
test('small real text files produce honest before/after hashes and changed lines', async () => {
  const input = await fixture('hello\nold\n', 'hello\nnew\n'), actual = await previewPlan(input);
  assert.equal(actual.coverage.textComplete, true);
  assert.deepEqual(actual.diff[0].hunks[0].lines, [{kind:'context',text:'hello'},{kind:'removed',text:'old'},{kind:'added',text:'new'},{kind:'context',text:''}]);
  assert.equal(actual.changes[0].before.sha256, sha('hello\nold\n'));
  assert.equal(actual.changes[0].after.sha256, sha('hello\nnew\n'));
  assert.equal(JSON.stringify(actual).includes(root), false);
});
test('file-byte limit is explicit and does not read or pretend to diff the omitted large body', async () => {
  const actual = await previewPlan(await fixture('old', 'x'.repeat(17000)));
  assert.equal(actual.coverage.textComplete, false);
  assert.deepEqual(actual.coverage.omitted, [{path:'a.txt',reason:'file-byte-limit'}]);
  assert.deepEqual(actual.diff[0].hunks, []); assert.equal(actual.coverage.bytesRead, 0);
});
test('binary and invalid UTF8 are classified rather than returned to the UI', async () => {
  for (const [bytes, reason] of [[Buffer.from([65,0,66]),'binary'],[Buffer.from([0xff,0xfe]),'non-utf8']]) {
    const actual = await previewPlan(await fixture('old', bytes));
    assert.equal(actual.coverage.textComplete, false); assert.equal(actual.coverage.omitted[0].reason, reason);
    assert.deepEqual(actual.diff[0].hunks, []);
  }
});
test('a concurrent byte replacement invalidates the observed file instead of showing new unbound content', async () => {
  const input = await fixture('old', 'new'); await writeFile(join(input.after.path, 'a.txt'), 'bad');
  await assert.rejects(previewPlan(input), error => error.code === 'SEP_PROJECT_CANDIDATE_CHANGED');
});
test('line and aggregate text bounds stay explicit and bounded for adversarial short lines', async () => {
  const actual = await previewPlan(await fixture('a\n'.repeat(1000), 'b\n'.repeat(1000)));
  assert.equal(actual.coverage.textComplete, false); assert.equal(actual.coverage.omitted[0].reason,'line-limit');
  const lines = actual.diff.flatMap(f=>f.hunks).flatMap(h=>h.lines);
  assert.equal(lines.length, 400); assert.ok(lines.reduce((sum,line)=>sum+Buffer.byteLength(line.text),0)<=65536);
});
test('preview refuses arbitrary paths and excessive metadata before reading a caller-selected file', async () => {
  const input = await fixture('old', 'new');
  await assert.rejects(previewPlan({...input, changes:[{path:'../a.txt',kind:'modified'}]}), e=>e.code==='SEP_MAC_WORKFLOW_INPUT');
  await assert.rejects(previewPlan({...input, changes:Array.from({length:257},(_,i)=>({path:`a${i}.txt`,kind:'modified'}))}), e=>e.code==='SEP_MAC_WORKFLOW_REVIEW_LIMIT');
});
test('pre-aborted preview and absent-file creation/deletion keep their exact semantics', async () => {
  const input = await fixture('old','new');
  await assert.rejects(previewPlan({...input,signal:AbortSignal.abort()}), e=>e.code==='SEP_PROJECT_CANCELLED');
  const created = await previewPlan(await fixture(null,'new')); assert.equal(created.changes[0].before,null); assert.equal(created.diff[0].hunks[0].lines[0].kind,'added');
  const deleted = await previewPlan(await fixture('old',null)); assert.equal(deleted.changes[0].after,null); assert.equal(deleted.diff[0].hunks[0].lines[0].kind,'removed');
});
test('directory-to-file and file-to-directory transitions do not hide the file body', async () => {
  const input=await fixture(null,'new text');await mkdir(join(input.before.path,'a.txt'));
  input.before.entries=[{path:'a.txt',kind:'directory'}];input.changes=[{path:'a.txt',kind:'modified'}];
  const created=await previewPlan(input);assert.equal(created.coverage.textComplete,true);assert.equal(created.diff[0].hunks[0]?.lines[0]?.text,'new text');
  const deleted=await previewPlan({...input,before:input.after,after:input.before});assert.equal(deleted.diff[0].hunks[0]?.lines[0]?.kind,'removed');
});
test('aggregate byte budget omits later bodies explicitly without exceeding total read limit',async()=>{
  const input=await fixture('a'.repeat(16000),'b'.repeat(16000));
  for(const name of ['second.txt','third.txt']){
    for(const [side,body] of [[input.before,'c'.repeat(16000)],[input.after,'d'.repeat(16000)]]){await writeFile(join(side.path,name),body);side.entries.push({path:name,kind:'file',size:16000,sha256:sha(body)});}
    input.changes.push({path:name,kind:'modified'});
  }
  const result=await previewPlan(input);assert.equal(result.coverage.bytesRead,64000);assert.equal(result.coverage.textComplete,false);
  assert.deepEqual(result.coverage.omitted,[{path:'third.txt',reason:'total-byte-limit'}]);assert.deepEqual(result.diff[2].hunks,[]);
});
