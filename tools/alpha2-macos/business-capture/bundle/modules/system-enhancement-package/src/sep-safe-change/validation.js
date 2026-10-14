import {spawn} from 'node:child_process';

const abort = signal => {
  if (signal?.aborted) throw Object.assign(new Error('SC_ABORTED'), {code: 'SC_ABORTED'});
};
const outcome = (kind, category, status, extra = {}) => ({
  kind, category, status, pass: status === 'pass' ? true : status === 'fail' ? false : null, ...extra,
});
const aggregate = results => {
  for (const status of ['fail', 'blocked', 'not_run']) if (results.some(result => result.status === status)) return status;
  return results.length ? 'pass' : 'not_run';
};

function javascriptSyntax(content, format, signal) {
  return new Promise(resolve => {
    let child;
    try {
      // Fixed parse-only arguments never execute candidate code, imports or package scripts.
      child = spawn(process.execPath, ['--check', '--input-type=' + (format === 'javascript-module' ? 'module' : 'commonjs')], {
        windowsHide: true,
        env: process.env.SystemRoot ? {SystemRoot: process.env.SystemRoot} : {},
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve(outcome('syntax', 'syntax', 'blocked', {format, reason: 'SC_SYNTAX_UNAVAILABLE'}));
      return;
    }

    let stopped = false, timedOut = false, outputLimited = false, unavailable = false, inputFailed = false, size = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, 5000);
    const output = chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 16384) { outputLimited = true; stop(); }
    };
    child.stdout.on('data', output);
    child.stderr.on('data', output);
    child.stdin.on('error', error => { inputFailed = true; });
    child.on('error', error => { unavailable = true; });
    child.once('close', (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      child.stdout.off('data', output);
      child.stderr.off('data', output);
      let status, reason;
      if (unavailable) { status = 'blocked'; reason = 'SC_SYNTAX_UNAVAILABLE'; }
      else if (timedOut) { status = 'blocked'; reason = 'SC_SYNTAX_TIMEOUT'; }
      else if (outputLimited) { status = 'blocked'; reason = 'SC_SYNTAX_OUTPUT_LIMIT'; }
      else if (exitSignal || (code !== 0 && code !== 1)) { status = 'blocked'; reason = 'SC_SYNTAX_TERMINATED'; }
      else if (code !== 0) { status = 'fail'; reason = 'SC_SYNTAX_INVALID'; }
      else if (inputFailed) { status = 'blocked'; reason = 'SC_SYNTAX_UNAVAILABLE'; }
      else status = 'pass';
      resolve(outcome('syntax', 'syntax', status, {format, ...(reason ? {reason} : {})}));
    });
    signal?.addEventListener('abort', stop, {once: true});
    if (signal?.aborted) stop();
    child.stdin.end(content);
  });
}

async function syntax(content, format, signal) {
  if (format === 'text') return outcome('syntax', 'syntax', 'not_run', {format, reason: 'SC_TEXT_HAS_NO_SYNTAX_CHECK'});
  if (format === 'json') {
    try {
      JSON.parse(content.replace(/^\uFEFF/, ''));
      return outcome('syntax', 'syntax', 'pass', {format});
    } catch (error) {
      return outcome('syntax', 'syntax', 'fail', {format, reason: 'SC_SYNTAX_INVALID'});
    }
  }
  if (format === 'javascript' || format === 'javascript-module') return javascriptSyntax(content, format, signal);
  return outcome('syntax', 'syntax', 'not_run', {format, reason: 'SC_SYNTAX_NOT_SUPPORTED'});
}

function checkContent(content, check) {
  if (check.kind === 'contains') return content.includes(check.value);
  if (check.kind === 'excludes') return !content.includes(check.value);
  if (check.kind === 'equals') return content === check.value;
  try {
    let value = JSON.parse(content.replace(/^\uFEFF/, ''));
    for (const key of check.pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
      value = value[key];
    }
    return value === check.value;
  } catch (error) {
    return false;
  }
}

/**
 * Validate a bounded candidate using content assertions and parse-only syntax checks.
 * Overall status includes unperformed runtime tests; publishEligible only describes
 * the existing content publication gate and never implies full acceptance.
 * @param {{content:string, format:string, checks:Array<object>, signal?:AbortSignal}} input Validated safe-change candidate and declared checks.
 * @returns {Promise<object>} Separate text, syntax and runtime evidence; the caller binds revision and candidate digest.
 */
export async function validateCandidate({content, format, checks, signal}) {
  abort(signal);
  const language = await syntax(content, format, signal);
  abort(signal);
  const textResults = checks.map(check => outcome(check.kind, 'text', checkContent(content, check) ? 'pass' : 'fail'));
  const results = [language, ...textResults, outcome('runtime', 'runtime', 'not_run', {reason: 'SC_RUNTIME_NOT_CONFIGURED'})];
  const textChecks = aggregate(textResults);
  const publishEligible = textChecks === 'pass' && (format === 'text' || language.status === 'pass');
  return {
    status: aggregate(results),
    publishEligible,
    results,
    textChecks,
    languageSyntax: language.status,
    runtimeTests: 'not_run',
  };
}
