// Test-only: real native storage/Profile with synthetic trusted user authority.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {appendFile, mkdir, mkdtemp, readFile, realpath, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {openWorkflowProject as openMacManagedProject} from './project-factory.mjs';
import {wrapManagedProject} from './derived-lifecycle.mjs';
import {createControlledFileProfile} from '../profile/controlled-files.mjs';
import {openProjectWorkflow} from './workflow-adapter.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const isCode = (...codes) => error => codes.includes(error?.code);
const fail = code => { throw Object.assign(new Error(code), {code}); };
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeBase = process.env.SEP_MAC_WORKFLOW_TEST_ROOT;
const helperPath = process.env.SEP_MAC_TREE_HELPER;
const helperSha256 = process.env.SEP_MAC_TREE_HELPER_SHA256;
const fixtures = new Set();

export async function preflight() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('SEP_MAC_NATIVE_REQUIRED');
  if (!nativeBase || !isAbsolute(nativeBase) || !helperPath || !isAbsolute(helperPath) || !/^[a-f0-9]{64}$/.test(helperSha256 ?? '')) fail('SEP_MAC_NATIVE_ENV_REQUIRED');
  await mkdir(nativeBase, {recursive:true, mode:0o700});
  if (await realpath(nativeBase) !== nativeBase) fail('SEP_MAC_TEST_ROOT_ALIAS');
  assert.equal(sha(await readFile(helperPath)), helperSha256);
  const fixed = JSON.parse(await readFile(new URL('./SOURCE_INPUTS.json', import.meta.url), 'utf8'));
  for (const input of fixed.inputs) assert.equal(sha(await readFile(join(sourceRoot, input.path))), input.sha256, input.path);
  await writeFile(join(nativeBase, 'PREFLIGHT.json'), JSON.stringify({platform:process.platform, arch:process.arch, node:process.version, helperSha256, sourceInputsSha256:sha(await readFile(new URL('./SOURCE_INPUTS.json', import.meta.url)))}, null, 2) + '\n', {flag:'wx', mode:0o600});
}

function syntheticAuthority(ownerGeneration) {
  const documents = new WeakMap(), approvals = new WeakMap();
  let activeDocument = 'document-1';
  const context = () => {
    const value = Object.freeze({});
    documents.set(value, {windowId:'synthetic-window', documentGeneration:activeDocument});
    return value;
  };
  const assertDocument = value => {
    const record = documents.get(value);
    if (!record || record.documentGeneration !== activeDocument) fail('SEP_MAC_WORKFLOW_CALLER_INVALID');
    return {...record, ownerGeneration};
  };
  return {
    context,
    navigate() { activeDocument = randomUUID(); },
    // Test-only replacement of explicit user action AFTER review presentation.
    confirm(review, ctx, {omissionsAcknowledged = false} = {}) {
      const document = assertDocument(ctx), token = Object.freeze({});
      approvals.set(token, {binding:{...review.binding, reviewId:review.reviewId, reviewSha256:review.reviewSha256}, document, omissionsAcknowledged});
      return token;
    },
    boundary: Object.freeze({
      assertDocument,
      consumeConfirmation(token, binding, ctx) {
        const document = assertDocument(ctx), approved = approvals.get(token);
        if (!approved || !isDeepStrictEqual(approved.document, document) || !isDeepStrictEqual(approved.binding, binding)) fail('SEP_MAC_WORKFLOW_APPROVAL_INVALID');
        approvals.delete(token);
        return Object.freeze({accepted:true, omissionsAcknowledged:approved.omissionsAcknowledged});
      },
    }),
  };
}

export async function fixture(contents = {}) {
  const parent = await mkdtemp(join(nativeBase, 'workflow-'));
  const root = join(parent, 'managed'), source = join(parent, 'source');
  await mkdir(root, {mode:0o700}); await mkdir(source, {mode:0o700});
  for (const [path, body] of Object.entries({'a.txt':'original\n', 'b.txt':'unchanged\n', ...contents})) await writeFile(join(source, path), body, {mode:0o600});
  let profile, project, workflow, authority, ctx, ownerGeneration;
  let interruptAtIntent = false;
  const callers = new WeakSet();
  const exec = {signal:new AbortController().signal}; callers.add(exec);
  const f = {
    parent, root, source, exec,
    get profile() { return profile; }, get project() { return project; },
    get workflow() { return workflow; }, get authority() { return authority; },
    get context() { return ctx; },
    async open({interrupt = false} = {}) {
      if (project && project.status().phase !== 'closed') fail('SEP_MAC_TEST_PRIOR_OWNER_ACTIVE');
      workflow = undefined; profile = undefined; project = undefined;
      interruptAtIntent = interrupt;
      ownerGeneration = randomUUID(); authority = syntheticAuthority(ownerGeneration); ctx = authority.context();
      const core = await openMacManagedProject({root, source, helperPath, helperSha256, onEvent(name) {
        if (interruptAtIntent && name === 'intent-durable') { interruptAtIntent = false; fail('SEP_PROJECT_INTERRUPTED'); }
      }});
      project = wrapManagedProject(core, {closeDeadlineMs:5000});
      profile = await createControlledFileProfile({project, source, closeDeadlineMs:5000, authorize:async value => {
        if (!callers.has(value)) fail('SEP_MAC_AGENT_SCOPE');
        return {sessionId:'synthetic-session', depth:0, cwd:source};
      }});
      workflow = await openProjectWorkflow({projectId:'current', ownerGeneration, source, controller:profile.controller, project, authority:authority.boundary, closeDeadlineMs:5000});
      return workflow;
    },
    async stage(text = 'changed\n') {
      await profile.execute('read', {file_path:'a.txt'}, exec);
      await profile.execute('write', {file_path:'a.txt', content:text}, exec);
      const plans = await profile.controller.plans(); assert.equal(plans.length, 1);
      return plans[0].planHash;
    },
    async reviewed(text = 'changed\n') {
      const planHash = await f.stage(text);
      return workflow.review({planHash}, ctx);
    },
    approved(review, options) {
      return {reviewId:review.reviewId, planHash:review.binding.planHash, approval:authority.confirm(review, ctx, options)};
    },
    async close() {
      let receipt;
      try { receipt = workflow ? await workflow.close() : profile ? await profile.controller.close() : project ? await project.close() : {status:'pass', resourcesConfirmedReleased:true}; }
      catch (error) { receipt = {status:'blocked', code:error.code ?? 'UNCLASSIFIED', resourcesConfirmedReleased:false}; }
      await appendFile(join(nativeBase, 'CLEANUP.jsonl'), JSON.stringify({fixture:parent.split('/').at(-1), receipt}) + '\n', {mode:0o600});
      return receipt;
    },
  };
  fixtures.add(f); return f;
}

export async function cleanup() {
  let blocked = 0;
  for (const f of fixtures) {
    const receipt = await f.close();
    if (receipt.status !== 'pass' || receipt.resourcesConfirmedReleased !== true) blocked++;
  }
  // No forced kills, arbitrary directory cleanup, or fabricated release receipt.
  assert.equal(blocked, 0, 'native fixture release not confirmed; inspect CLEANUP.jsonl');
}

export async function managedText(f) {
  const current = await f.project.current();
  return readFile(join(current.path, 'a.txt'), 'utf8');
}

export async function originalUnchanged(f) {
  assert.equal(await readFile(join(f.source, 'a.txt'), 'utf8'), 'original\n');
}
