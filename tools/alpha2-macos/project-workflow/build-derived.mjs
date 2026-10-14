// Build-time only. The only writable destinations are this new candidate tree.
import {readFile,writeFile} from 'node:fs/promises';
import {deriveReadonlySources} from './derive-sources.mjs';
const result=deriveReadonlySources({core:await readFile(new URL('../transactions/transaction-store.mjs',import.meta.url),'utf8'),lifecycle:await readFile(new URL('../lifecycle/managed-project-lifecycle.mjs',import.meta.url),'utf8')});
await writeFile(new URL('./derived-transaction-store.mjs',import.meta.url),result.outputs.core);
await writeFile(new URL('./derived-lifecycle.mjs',import.meta.url),result.outputs.lifecycle);
await writeFile(new URL('./READONLY-ORIGIN.json',import.meta.url),JSON.stringify({schema:1,scope:'owner-exclusive-read-only-generation-and-bounded-plan-preview',...result.origin},null,2)+'\n');
console.log(JSON.stringify({scope:'source-derivation-only',core:result.origin.core.resultSha256,lifecycle:result.origin.lifecycle.resultSha256}));
