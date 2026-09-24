import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'), project = path.resolve(root, '../..');
const baseline = path.join(project, 'dsh-daily/releases/sep-alpha2-updatefix-20260924/store');
const overlay = path.join(import.meta.dirname, 'overlay'), runtime = path.join(import.meta.dirname, 'runtime/p0500');
const bindings = [];
async function input(file) { const bytes = await fs.readFile(file); bindings.push({ path: file, sha256: createHash('sha256').update(bytes).digest('hex') }); return bytes.toString('utf8'); }
const change = (text, old, next, count = 1) => { if (text.split(old).length !== count + 1) throw Error('PATCH_ANCHOR_CHANGED ' + old); return text.replaceAll(old, next); };
async function output(file, text) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); bindings.push({ path: file, sha256: createHash('sha256').update(text).digest('hex') }); }
let guardian = await input(path.join(root, 'core/overlay/p0500/src/guardian.mjs'));
guardian = 'import {safeHostCode,startupFailure} from "./startup-diagnostic.mjs";\n' + guardian;
guardian = change(guardian, 'current.ready.reject(fault(\'GUARDIAN_NOT_READY\'));', 'current.ready.reject(startupFailure(current));');
guardian = change(guardian, 'run.ready.reject(fault(\'GUARDIAN_NOT_READY\'));', 'run.ready.reject(startupFailure(run));', 3);
guardian = change(guardian, 'held.ready.reject(fault(\'GUARDIAN_NOT_READY\'));', 'held.ready.reject(startupFailure(held));');
guardian = change(guardian, 'ready: run.wasReady, errorCode: run.errorCode, at:', 'ready: run.wasReady, errorCode: run.errorCode, ...(safeHostCode(run.hostCode)?{hostCode:run.hostCode}:{}), at:');
guardian = change(guardian, 'wasReady: false, errorCode: null, readyTimer:', 'wasReady: false, errorCode: null, hostCode: null, readyTimer:');
guardian = change(guardian, "child.on('message', message => {", `child.on('message', message => {
        if(message?.type==='fatal') {
          // Only this owned child's startup generation can supply diagnostics.
          // The original message is never retained or forwarded.
          const code=safeHostCode(message.code);
          if(code&&current===run&&!run.abort.signal.aborted&&state.phase==='starting'&&!run.wasReady&&!run.hostCode)run.hostCode=code;
          return;
        }`);
await output(path.join(overlay, 'p0500/src/guardian.mjs'), guardian);
let server = await input(path.join(root, 'core/overlay/p0500/src/server.mjs'));
server = 'import {safeHostCode} from "./startup-diagnostic.mjs";\n' + server;
server = change(server, "error:{code:typeof error.code==='string'?error.code:'RECOVERY_OPERATION_FAILED'}", "error:{code:typeof error.code==='string'?error.code:'RECOVERY_OPERATION_FAILED',...(safeHostCode(error.hostCode)?{hostCode:error.hostCode}:{})}", 2);
server = change(server, "startHost:()=>{if(!guardian)throw failure(guardianBlocked??'RECOVERY_HOST_UNCONFIGURED');return guardian.start();}", "startHost:params=>{if(!guardian)throw failure(guardianBlocked??'RECOVERY_HOST_UNCONFIGURED');return guardian.start(params);}");
await output(path.join(overlay, 'p0500/src/server.mjs'), server);
let client = await input(path.join(baseline, 'p0500/src/client.mjs'));
client = 'import {safeHostCode} from "./startup-diagnostic.mjs";\n' + client;
client = change(client, "error.code=value.error?.code??'RECOVERY_UNAVAILABLE';reject(error);", "error.code=value.error?.code??'RECOVERY_UNAVAILABLE';const hostCode=safeHostCode(value.error?.hostCode);if(hostCode)error.hostCode=hostCode;reject(error);");
await output(path.join(overlay, 'p0500/src/client.mjs'), client);
let host = await input(path.join(root, 'host-lifecycle/overlay/p0498/lib/index.js'));
host = 'import {fatalPayload} from "./startup-diagnostic.mjs";\n' + host;
host = change(host, 'const message = error instanceof Error ? error.message : String(error);', 'const diagnostic = fatalPayload(error);');
host = change(host, 'process.send?.({ type: "fatal", message },', 'process.send?.(diagnostic,');
host = change(host, '    console.error(error);\n    process.exitCode = 1;', '    console.error(diagnostic.code);\n    process.exitCode = 1;');
await output(path.join(overlay, 'p0498/lib/index.js'), host);
const hostPackage = JSON.parse(await input(path.join(root, 'host-lifecycle/overlay/p0498/package.json')));
hostPackage.files = [...new Set([...hostPackage.files, 'lib/startup-diagnostic.mjs', 'lib/startup-diagnostic.d.mts'])];
await output(path.join(overlay, 'p0498/package.json'), JSON.stringify(hostPackage, null, 2) + '\n');
await output(path.join(import.meta.dirname, 'source/apps/desktop-host/package.json'), JSON.stringify(hostPackage, null, 2) + '\n');
let sourceHost = await input(path.join(root, 'host-lifecycle/source/apps/desktop-host/src/index.ts'));
sourceHost = 'import {fatalPayload} from "./startup-diagnostic.mjs"\n' + sourceHost;
sourceHost = change(sourceHost, 'const message = error instanceof Error ? error.message : String(error)', 'const diagnostic = fatalPayload(error)');
sourceHost = change(sourceHost, "process.send?.({ type: 'fatal', message },", 'process.send?.(diagnostic,');
sourceHost = change(sourceHost, '    console.error(error)\n    process.exitCode = 1', '    console.error(diagnostic.code)\n    process.exitCode = 1');
await output(path.join(import.meta.dirname, 'source/apps/desktop-host/src/index.ts'), sourceHost);
for (const name of ['startup-diagnostic.mjs', 'startup-diagnostic.d.mts']) {
 const text = await input(path.join(import.meta.dirname, name));
 for (const dir of ['p0500/src', 'p0498/lib']) await output(path.join(overlay, dir, name), text);
 await output(path.join(import.meta.dirname, 'source/apps/desktop-host/src', name), text);
}
// Isolated runtime for real Guardian/server/client tests; shared core stays intact.
await fs.mkdir(runtime, { recursive: true });
await fs.cp(path.join(root, 'core/test-runtime/p0500/src'), path.join(runtime, 'src'), { recursive: true });
await fs.cp(path.join(baseline, 'p0500/ui'), path.join(runtime, 'ui'), { recursive: true });
await fs.copyFile(path.join(baseline, 'p0500/package.json'), path.join(runtime, 'package.json'));
await fs.symlink(path.join(baseline, 'p0500/node_modules'), path.join(runtime, 'node_modules'), 'junction').catch(e => { if (e.code !== 'EEXIST') throw e; });
await fs.cp(path.join(overlay, 'p0500/src'), path.join(runtime, 'src'), { recursive: true });
await output(path.join(import.meta.dirname, 'manifest.json'), JSON.stringify({ schema: 1, files: bindings }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'pass', overlay, runtime }));
