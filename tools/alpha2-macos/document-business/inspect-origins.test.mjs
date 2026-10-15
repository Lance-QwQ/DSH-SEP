import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import * as tools from './parsed-tools.mjs';
import * as context from './context.mjs';
import * as consumers from './consumers.mjs';
import * as runtime from './runtime-source.mjs';
import * as layout from './profile-layout.mjs';
import * as standalone from './standalone.mjs';
const receipt={tools:tools.derivation,context:context.derivation,consumers:consumers.derivation,runtime:runtime.derivation,layout:layout.derivation,standalone:standalone.derivation};
test('candidate derives and imports with auditable complete-source hashes',async()=>{
 assert.equal(typeof standalone.openMacBusiness,'function');assert.deepEqual({rag:tools.derivation.rag.outputSha256,media:tools.derivation.media.outputSha256,context:context.derivation.capability.outputSha256,consumers:consumers.derivation.outputSha256,runtime:runtime.derivation.document.outputSha256,layout:layout.canonicalSha256,standalone:standalone.canonicalSha256},{rag:'ba2c9556cd725a1d349b9368854f39edae90f8e1b223a411671eb76669f7695c',media:'e50b467f1e5fa46611d5c062d18428f287c7d1f384bb1111944061fe45776223',context:'32d11e18bb5e208f7f6814537856be38f94516c054450d89fa68326f41780404',consumers:'cd18255aa82d7e1169c3a1b6f11ef0a67b577e950115c714d04f3c7286ed6276',runtime:'2d680c897c8044ef04ea04053185eca6f8e04fd3eea8e820ee8c8e1b516a12d9',layout:'fbcfc6515dde161be366f6e4956fdabe13aa30038d9a4827888d0b8f5402618c',standalone:'639f9bd6913184b65731a02270ff72a139690b11732d181097cd179251147cbe'});
 await mkdir(process.env.SEP_DOCUMENT_TEST_ROOT,{recursive:true,mode:0o700});await writeFile(join(process.env.SEP_DOCUMENT_TEST_ROOT,'ORIGIN-RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');
});
