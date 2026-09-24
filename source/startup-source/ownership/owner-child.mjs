import { acquireOwnerFile } from './owner-file.mjs';
const [path, mode] = process.argv.slice(2);
const lease = await acquireOwnerFile({ path, payload: { version: 1, pid: process.pid, token: crypto.randomUUID() }, validatePrior: v => { if (v.version !== 1 || typeof v.token !== 'string') throw Error('invalid'); }, onEvent: async phase => {
  if (phase === mode) { process.send({ phase }); await new Promise(resolve => setTimeout(resolve, 80)); process.exit(73); }
} });
process.send({ phase: 'ready' });
setInterval(() => {}, 1000);
