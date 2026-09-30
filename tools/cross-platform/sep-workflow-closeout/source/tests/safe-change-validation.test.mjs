import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

const module = await import('../src/sep-safe-change/validation.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
function validate(options) {
  assert.equal(typeof module.validateCandidate, 'function', 'candidate validation must expose evidence-based validation');
  return module.validateCandidate(options);
}
const input = (content, format = 'text', checks = [{kind: 'contains', value: 'value'}]) => ({content, format, checks});
const resultOf = (result, category) => result.results.find(entry => entry.category === category);

test('invalid Python treated as text passes only its declared content check', async () => {
  const result = await validate(input('def broken(:\n    value'));
  assert.equal(result.textChecks, 'pass');
  assert.equal(result.languageSyntax, 'not_run');
  assert.equal(result.runtimeTests, 'not_run');
  assert.equal(result.status, 'not_run');
  assert.equal(result.publishEligible, true);
  assert.equal(resultOf(result, 'syntax').pass, null);
  assert.equal(resultOf(result, 'syntax').reason, 'SC_TEXT_HAS_NO_SYNTAX_CHECK');
  assert.equal(resultOf(result, 'runtime').pass, null);
  assert.ok(result.results.every(entry => ['pass', 'fail', 'blocked', 'not_run'].includes(entry.status)));
});

test('an unsupported language is never passed through the JavaScript parser or made publishable', async () => {
  const result = await validate(input('value = 1', 'python'));
  assert.equal(result.languageSyntax, 'not_run');
  assert.equal(result.publishEligible, false);
  assert.equal(result.status, 'not_run');
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_NOT_SUPPORTED');
});

test('valid JSON preserves both syntax and JSON pointer check evidence', async () => {
  const result = await validate(input('\uFEFF{"nested":{"a/b":{"~key":7}}}', 'json', [{kind: 'jsonValue', pointer: '/nested/a~1b/~0key', value: 7}]));
  assert.equal(result.languageSyntax, 'pass');
  assert.equal(result.textChecks, 'pass');
  assert.equal(result.status, 'not_run');
  assert.equal(result.publishEligible, true);
  assert.equal(resultOf(result, 'syntax').pass, true);
});

test('invalid JSON cannot be published even when its content check passes', async () => {
  const result = await validate(input('{"value":', 'json'));
  assert.equal(result.textChecks, 'pass');
  assert.equal(result.languageSyntax, 'fail');
  assert.equal(result.status, 'fail');
  assert.equal(result.publishEligible, false);
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_INVALID');
});

test('content checks retain individual failures including missing JSON pointers', async () => {
  const result = await validate(input('{"value":1}', 'json', [
    {kind: 'contains', value: 'value'},
    {kind: 'excludes', value: 'missing'},
    {kind: 'equals', value: 'different'},
    {kind: 'jsonValue', pointer: '/toString', value: null},
  ]));
  assert.equal(result.textChecks, 'fail');
  assert.equal(result.status, 'fail');
  assert.equal(result.publishEligible, false);
  assert.deepEqual(result.results.filter(entry => entry.category === 'text').map(entry => [entry.kind, entry.status, entry.pass]), [
    ['contains', 'pass', true], ['excludes', 'pass', true], ['equals', 'fail', false], ['jsonValue', 'fail', false],
  ]);
});

test('empty declared checks cannot vacuously satisfy publication requirements', async () => {
  const result = await validate(input('value', 'text', []));
  assert.equal(result.textChecks, 'not_run');
  assert.equal(result.publishEligible, false);
  assert.equal(result.status, 'not_run');
});

test('JavaScript syntax checking never executes the candidate or resolves its imports', async () => {
  const result = await validate(input('import value from "./missing-module.js"; throw new Error("candidate must not run");', 'javascript-module'));
  assert.equal(result.languageSyntax, 'pass');
  assert.equal(result.publishEligible, true);
  assert.equal(result.status, 'not_run');
});

test('CommonJS syntax is checked separately from module syntax', async () => {
  const result = await validate(input('module.exports = {value: 1};', 'javascript'));
  assert.equal(result.languageSyntax, 'pass');
  assert.equal(result.publishEligible, true);
  const invalid = await validate(input('import value from "./missing-module.js";', 'javascript'));
  assert.equal(invalid.languageSyntax, 'fail');
  assert.equal(invalid.publishEligible, false);
});

test('invalid JavaScript retains syntax failure even when text assertions pass', async () => {
  const result = await validate(input('const value = ;', 'javascript'));
  assert.equal(result.textChecks, 'pass');
  assert.equal(result.languageSyntax, 'fail');
  assert.equal(result.status, 'fail');
  assert.equal(result.publishEligible, false);
});

test('cancellation before validation rejects without producing success evidence', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(async () => validate({...input('value'), signal: controller.signal}), {code: 'SC_ABORTED'});
});

function checker(t) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kills = [];
  child.kill = signal => { child.kills.push(signal); return true; };
  const calls = [];
  t.mock.method(childProcess, 'spawn', (...args) => { calls.push(args); return child; });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return {child, calls};
}

test('the JavaScript checker accepts only fixed parse arguments and a scrubbed environment', async t => {
  const {child, calls} = checker(t);
  const pending = validate(input('const value = 1;', 'javascript-module'));
  assert.equal(calls.length, 1);
  const [command, args, options] = calls[0];
  assert.equal(command, process.execPath);
  assert.deepEqual(args, ['--check', '--input-type=module']);
  assert.equal(options.shell, undefined);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(Object.keys(options.env), process.env.SystemRoot ? ['SystemRoot'] : []);
  child.emit('close', 0, null);
  assert.equal((await pending).languageSyntax, 'pass');
});

test('cancelling an active checker kills it and waits for close before rejecting', async t => {
  const {child} = checker(t), controller = new AbortController();
  const pending = validate({...input('const value = 1;', 'javascript'), signal: controller.signal});
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  controller.abort();
  await Promise.resolve();
  assert.deepEqual(child.kills, ['SIGKILL']);
  assert.equal(settled, false);
  child.emit('close', null, 'SIGKILL');
  await assert.rejects(pending, {code: 'SC_ABORTED'});
});

test('a timeout remains blocked even if the killed checker exits zero', async t => {
  const {child} = checker(t);
  t.mock.timers.enable({apis: ['setTimeout']});
  const pending = validate(input('const value = 1;', 'javascript'));
  let settled = false;
  pending.then(() => { settled = true; });
  t.mock.timers.tick(5000);
  await Promise.resolve();
  assert.deepEqual(child.kills, ['SIGKILL']);
  assert.equal(settled, false);
  child.emit('close', 0, null);
  const result = await pending;
  assert.equal(result.languageSyntax, 'blocked');
  assert.equal(result.status, 'blocked');
  assert.equal(result.publishEligible, false);
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_TIMEOUT');
  assert.equal(resultOf(result, 'syntax').pass, null);
});

test('checker stdout and stderr share one output limit and are never retained', async t => {
  const {child} = checker(t);
  const pending = validate(input('const value = 1;', 'javascript'));
  child.stdout.emit('data', Buffer.alloc(8192, 65));
  child.stderr.emit('data', Buffer.alloc(8193, 66));
  assert.deepEqual(child.kills, ['SIGKILL']);
  child.emit('close', 0, null);
  const result = await pending;
  assert.equal(result.status, 'blocked');
  assert.equal(result.publishEligible, false);
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_OUTPUT_LIMIT');
  assert.ok(JSON.stringify(result).length < 2048);
});

test('an exact output limit does not turn a successful parse into a blocked check', async t => {
  const {child} = checker(t);
  const pending = validate(input('const value = 1;', 'javascript'));
  child.stderr.emit('data', Buffer.alloc(16384));
  assert.deepEqual(child.kills, []);
  child.emit('close', 0, null);
  assert.equal((await pending).languageSyntax, 'pass');
});

test('an unavailable checker is blocked and waits for process closure', async t => {
  const {child} = checker(t);
  const pending = validate(input('const value = 1;', 'javascript'));
  let settled = false;
  pending.then(() => { settled = true; });
  child.emit('error', Object.assign(new Error('unavailable'), {code: 'ENOENT'}));
  await Promise.resolve();
  assert.equal(settled, false);
  child.emit('close', -2, null);
  const result = await pending;
  assert.equal(result.status, 'blocked');
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_UNAVAILABLE');
  assert.equal(result.publishEligible, false);
});

test('unexpected checker termination is blocked rather than classified as invalid source', async t => {
  const {child} = checker(t);
  const pending = validate(input('const value = 1;', 'javascript'));
  child.emit('close', null, 'SIGTERM');
  const result = await pending;
  assert.equal(result.languageSyntax, 'blocked');
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_TERMINATED');
});

test('completed checking removes cancellation hooks and timeout activity', async t => {
  const {child} = checker(t), controller = new AbortController();
  t.mock.timers.enable({apis: ['setTimeout']});
  const pending = validate({...input('const value = 1;', 'javascript'), signal: controller.signal});
  child.emit('close', 0, null);
  assert.equal((await pending).languageSyntax, 'pass');
  controller.abort();
  t.mock.timers.tick(5000);
  assert.deepEqual(child.kills, []);
});
test('a checker startup or internal failure does not count as a source syntax error', async t => {
  const {child} = checker(t);
  const pending = validate(input('const value = 1;', 'javascript'));
  child.emit('close', 9, null);
  const result = await pending;
  assert.equal(result.languageSyntax, 'blocked');
  assert.equal(resultOf(result, 'syntax').reason, 'SC_SYNTAX_TERMINATED');
  assert.equal(result.publishEligible, false);
});
