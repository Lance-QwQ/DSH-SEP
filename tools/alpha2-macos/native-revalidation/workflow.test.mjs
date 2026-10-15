import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {preflight, fixture, cleanup, isCode, managedText, originalUnchanged} from './workflow-fixture.mjs';

test.before(preflight);
test.after(cleanup);
const define = (name, fn) => test(name, {timeout:30000}, fn);

define('status and plan listing never expose physical paths or file bodies', async () => {
  const f = await fixture(), w = await f.open();
  const first = await w.status({}, f.context);
  assert.equal(first.projectId, 'current'); assert.equal(first.current.generation, 1);
  assert.equal(first.current.sequence, 0); assert.deepEqual(await w.plans({}, f.context), []);
  const planHash = await f.stage(); const plans = await w.plans({}, f.context);
  assert.equal(plans.length, 1); assert.equal(plans[0].planHash, planHash);
  const publicResult = JSON.stringify({first, plans});
  assert.equal(publicResult.includes(f.root), false); assert.equal(publicResult.includes('original\n'), false);
  await originalUnchanged(f);
});

define('one review obtains verified baseline/candidate diff without recursively waiting on the Profile queue', async () => {
  const f = await fixture(), w = await f.open(), planHash = await f.stage();
  const abort = new AbortController();
  const deadline = delay(5000, undefined, {signal:abort.signal}).then(() => { throw Object.assign(new Error('review queue deadlock'), {code:'REVIEW_TEST_DEADLINE'}); });
  let review;
  try { review = await Promise.race([w.review({planHash}, f.context), deadline]); }
  finally { abort.abort(); }
  assert.equal(review.binding.planHash, planHash); assert.equal(review.binding.baseGeneration, 1);
  assert.equal(review.binding.baseSequence, 0); assert.match(review.reviewSha256, /^[a-f0-9]{64}$/);
  assert.equal(review.coverage.textComplete, true);
  assert.ok(JSON.stringify(review.diff).includes('original')); assert.ok(JSON.stringify(review.diff).includes('changed'));
  assert.equal(JSON.stringify(review).includes(f.root), false);
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('exact one-use user approval commits only a managed generation and cannot be replayed', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed();
  const input = f.approved(review); const result = await w.commit(input, f.context);
  assert.equal(result.status, 'committed'); assert.equal(result.generation, 2); assert.equal(result.sequence, 1);
  assert.equal(await managedText(f), 'changed\n'); await originalUnchanged(f);
  await assert.rejects(w.commit(input, f.context), isCode('SEP_MAC_WORKFLOW_APPROVAL_INVALID', 'SEP_MAC_WORKFLOW_APPROVAL_STALE'));
});

define('plan hash, JSON approval and a copied capability never authorize commit', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  for (const approval of [undefined, {}, {...input.approval}, {accepted:true, planHash:input.planHash}]) {
    await assert.rejects(w.commit({...input, approval}, f.context), isCode('SEP_MAC_WORKFLOW_APPROVAL_INVALID', 'SEP_MAC_WORKFLOW_INPUT'));
  }
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('candidate bytes changed after explicit approval refuse publication', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  const view = await f.project.view(input.planHash); await writeFile(join(view.path, 'a.txt'), 'tampered\n');
  await assert.rejects(w.commit(input, f.context), isCode('SEP_PROJECT_CANDIDATE_CHANGED', 'SEP_MAC_WORKFLOW_APPROVAL_STALE'));
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('managed baseline bytes changed after approval refuse publication', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  const current = await f.project.current(); await writeFile(join(current.path, 'a.txt'), 'foreign-baseline\n');
  await assert.rejects(w.commit(input, f.context), isCode('SEP_PROJECT_BASELINE_CHANGED', 'SEP_MAC_WORKFLOW_APPROVAL_STALE'));
  await originalUnchanged(f);
});

define('a later staged model edit invalidates the earlier approved plan', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  await f.stage('newer-candidate\n');
  await assert.rejects(w.commit(input, f.context), isCode('SEP_PROJECT_STALE_PLAN', 'SEP_MAC_WORKFLOW_APPROVAL_STALE'));
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('cancel revokes approval without discarding the staged candidate', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  await w.cancel({reviewId:review.reviewId}, f.context);
  await assert.rejects(w.commit(input, f.context), isCode('SEP_MAC_WORKFLOW_APPROVAL_INVALID', 'SEP_MAC_WORKFLOW_APPROVAL_STALE'));
  assert.equal((await w.plans({}, f.context))[0].planHash, input.planHash);
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('navigation makes a previously bound window context and approval unusable', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  f.authority.navigate();
  await assert.rejects(w.commit(input, f.context), isCode('SEP_MAC_WORKFLOW_CALLER_INVALID'));
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('closing admission revokes approvals and whenClosed requires real resource release', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed(), input = f.approved(review);
  const close = w.close();
  await assert.rejects(w.commit(input, f.context), isCode('SEP_MAC_WORKFLOW_CLOSED'));
  const receipt = await close; assert.equal(receipt.status, 'pass'); assert.equal(receipt.resourcesConfirmedReleased, true);
  const final = await w.whenClosed(); assert.equal(final.status, 'pass'); assert.equal(final.resourcesConfirmedReleased, true);
  await originalUnchanged(f);
});

define('restart retains the plan but needs new selection, review and user approval', async () => {
  const f = await fixture(), old = await f.open(), review = await f.reviewed(), input = f.approved(review), oldContext = f.context;
  assert.equal((await f.close()).status, 'pass'); const w = await f.open();
  const plans = await w.plans({}, f.context); assert.equal(plans[0].planHash, input.planHash);
  await assert.rejects(w.commit(input, f.context), isCode('SEP_MAC_WORKFLOW_APPROVAL_INVALID', 'SEP_MAC_WORKFLOW_APPROVAL_STALE', 'SEP_MAC_RESTART_REVIEW_REQUIRED'));
  await assert.rejects(old.review({planHash:input.planHash}, oldContext), isCode('SEP_MAC_WORKFLOW_CLOSED'));
  await w.select({planHash:input.planHash}, f.context);
  const fresh = await w.review({planHash:input.planHash}, f.context);
  assert.notEqual(fresh.reviewId, review.reviewId);
  assert.equal((await w.commit(f.approved(fresh), f.context)).status, 'committed');
  await originalUnchanged(f);
});

define('generation history is bounded authoritative metadata and restore only stages a candidate', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed();
  await w.commit(f.approved(review), f.context);
  const page1 = await w.generations({after:0, limit:1}, f.context);
  assert.equal(page1.items.length, 1); assert.equal(page1.items[0].generation, 1); assert.equal(page1.nextAfter, 1);
  const page2 = await w.generations({after:page1.nextAfter, limit:1}, f.context);
  assert.equal(page2.items[0].generation, 2); assert.equal(page2.items[0].current, true); assert.equal(page2.nextAfter, null);
  assert.equal(JSON.stringify([page1, page2]).includes(f.root), false);
  const candidate = await w.restore({generation:1}, f.context);
  assert.match(candidate.planHash, /^[a-f0-9]{64}$/); assert.equal(await managedText(f), 'changed\n');
  const restoredReview = await w.review({planHash:candidate.planHash}, f.context);
  const restored = await w.commit(f.approved(restoredReview), f.context);
  assert.equal(restored.status, 'committed'); assert.equal(restored.generation, 3);
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('known durable intent is reconciled after restart without claiming the interrupted commit succeeded', async () => {
  const f = await fixture(), w = await f.open({interrupt:true}), review = await f.reviewed();
  await assert.rejects(w.commit(f.approved(review), f.context), isCode('SEP_PROJECT_INTERRUPTED'));
  assert.equal((await f.close()).status, 'pass'); const next = await f.open();
  const recovered = await next.recover({}, f.context); assert.equal(recovered.status, 'pass'); assert.equal(recovered.action, 'reconciled');
  assert.equal((await next.status({}, f.context)).current.sequence, 0);
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('bounded preview reports body omissions and refuses approval that did not acknowledge them', async () => {
  const f = await fixture(), w = await f.open(), review = await f.reviewed('x'.repeat(24000));
  assert.equal(review.coverage.textComplete, false); assert.ok(review.coverage.omitted.length > 0);
  const renderedText = review.diff.flatMap(file => file.hunks).flatMap(hunk => hunk.lines).map(line => line.text);
  assert.ok(renderedText.reduce((n, value) => n + Buffer.byteLength(value), 0) <= 65536);
  assert.ok(renderedText.length <= 400);
  await assert.rejects(w.commit(f.approved(review), f.context), isCode('SEP_MAC_WORKFLOW_OMISSIONS_UNACKNOWLEDGED'));
  assert.equal(await managedText(f), 'original\n');
  const current = await w.review({planHash:review.binding.planHash}, f.context);
  assert.equal((await w.commit(f.approved(current, {omissionsAcknowledged:true}), f.context)).status, 'committed');
  await originalUnchanged(f);
});

define('discard removes only the exact staged plan and keeps the current generation/source', async () => {
  const f = await fixture(), w = await f.open(), planHash = await f.stage();
  assert.equal((await w.discard({planHash}, f.context)).status, 'pass');
  assert.deepEqual(await w.plans({}, f.context), []);
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('model entry has no project management methods or approval issuer', async () => {
  const f = await fixture(); await f.open();
  for (const method of ['commit', 'select', 'review', 'restore', 'recover', 'discard', 'generations', 'confirm']) {
    await assert.rejects(f.profile.execute(method, {}, f.exec), isCode('SEP_MAC_TOOL_UNAVAILABLE'));
  }
  assert.equal(await managedText(f), 'original\n'); await originalUnchanged(f);
});

define('management methods reject arbitrary paths, unknown keys and unbounded generation requests', async () => {
  const f = await fixture(), w = await f.open(), planHash = await f.stage();
  for (const input of [{planHash, path:'../../secret'}, {planHash, callback:'readFile'}, {path:'a.txt'}]) {
    await assert.rejects(w.review(input, f.context), isCode('SEP_MAC_WORKFLOW_INPUT'));
  }
  for (const input of [{after:0, limit:0}, {after:0, limit:33}, {after:-1, limit:1}, {after:0, limit:1, path:f.root}]) {
    await assert.rejects(w.generations(input, f.context), isCode('SEP_MAC_WORKFLOW_INPUT'));
  }
  await originalUnchanged(f);
});
