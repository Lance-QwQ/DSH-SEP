import {mkdir, mkdtemp, writeFile, realpath} from 'node:fs/promises';
import {join, resolve, isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifySource} from './verify-source.mjs';

const testNames = ['validation', 'confirmation', 'closeout', 'engine'];

/** Run the same four SEP unit files three times, preserving every round and attempt. */
export async function runUnitRounds({sourceRoot, outputRoot, sourceManifestSha256}) {
  if (!isAbsolute(outputRoot)) throw Error('OUTPUT_ROOT_MUST_BE_ABSOLUTE');
  if (process.platform === 'win32' && !/^D:[\\/]/i.test(outputRoot)) throw Error('WINDOWS_OUTPUT_ROOT_MUST_BE_D_DRIVE');
  await mkdir(outputRoot, {recursive: true});
  if (process.platform === 'win32' && !/^D:[\\/]/i.test(await realpath(outputRoot))) throw Error('WINDOWS_OUTPUT_ALIAS_NOT_ON_D');
  const attempt = await mkdtemp(join(outputRoot, 'attempt-')), rounds = [];
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(KEY|SECRET|TOKEN|PASSWORD)/i.test(name) && name !== 'NODE_OPTIONS' && !name.startsWith('NODE_TEST_')));
  for (let round = 1; round <= 3; round++) {
    const temporaryRoot = join(attempt, 'round-' + round + '-temporary');
    await mkdir(temporaryRoot);
    const started = Date.now();
    const execution = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testNames.map(name => join(sourceRoot, 'tests', 'safe-change-' + name + '.test.mjs'))], {
      cwd: sourceRoot,
      env: {...environment, TEMP: temporaryRoot, TMP: temporaryRoot, TMPDIR: temporaryRoot, SEP_WORKFLOW_TEST_ROOT: temporaryRoot, SEP_CONFIRMATION_TEST_ROOT: temporaryRoot, SEP_UNIT_ROUND: String(round)},
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
      killSignal: 'SIGKILL',
      maxBuffer: 2 * 1024 * 1024,
    });
    await writeFile(join(attempt, 'round-' + round + '.log'), (execution.stdout ?? '') + (execution.stderr ?? ''));
    const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map(name => [name, Number((execution.stdout ?? '').match(new RegExp('^# ' + name + ' ([0-9]+)', 'm'))?.[1] ?? -1)]));
    const entry = {
      round,
      status: execution.status === 0 && !execution.error && !execution.signal && counts.tests > 0 && counts.pass === counts.tests && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 ? 'pass' : 'fail',
      counts,
      exitCode: execution.status,
      signal: execution.signal ?? null,
      errorCode: execution.error?.code ?? null,
      elapsedMs: Date.now() - started,
      log: 'round-' + round + '.log',
    };
    rounds.push(entry);
    await writeFile(join(attempt, 'round-' + round + '.json'), JSON.stringify(entry, null, 2) + '\n');
  }
  const result = {
    schema: 1,
    status: rounds.every(round => round.status === 'pass') ? 'pass' : 'fail',
    scope: 'SEP pure-JavaScript validation, confirmation, closeout and engine unit regressions only',
    realLoaderComposition: 'not_run',
    runtimeApplicationTests: 'not_run',
    release: 'not_run',
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    sourceManifestSha256,
    rounds,
  };
  await writeFile(join(attempt, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !isAbsolute(args[1])) throw Error('Usage: node run-unit.mjs --output <absolute-artifact-directory>');
  const verified = await verifySource();
  const result = await runUnitRounds({sourceRoot: join(import.meta.dirname, 'source'), outputRoot: args[1], sourceManifestSha256: verified.manifestSha256});
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'pass' ? 0 : 1;
}
