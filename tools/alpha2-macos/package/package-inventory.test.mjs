import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rename,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {inventoryPackage,verifyPackage} from './package-inventory.mjs';
const base=resolve(process.env.SEP_MAC_PACKAGE_TEST_ROOT??'');
assert(process.env.SEP_MAC_PACKAGE_TEST_ROOT,'explicit generated output root required');
await mkdir(base,{recursive:true});
async function fixture(){const root=await mkdtemp(join(base,'inventory-'));await mkdir(join(root,'payload'));await writeFile(join(root,'payload/main.mjs'),'export const ready=true;\n');return root;}
test('inventory is independent of absolute installation location',async()=>{const root=await fixture(),receipt=await inventoryPackage(root);assert.equal(receipt.schema,1);assert(!JSON.stringify(receipt).includes(root));await rename(root,root+'-moved');assert.equal((await verifyPackage(root+'-moved',receipt)).status,'pass');});
test('content changes are detected with same file length',async()=>{const root=await fixture(),receipt=await inventoryPackage(root);await writeFile(join(root,'payload/main.mjs'),'export const ready=oops;\n');await assert.rejects(verifyPackage(root,receipt),{code:'SEP_MAC_PACKAGE_CHANGED'});});
test('an added entry cannot pass the original receipt',async()=>{const root=await fixture(),receipt=await inventoryPackage(root);await writeFile(join(root,'extra.txt'),'extra');await assert.rejects(verifyPackage(root,receipt),{code:'SEP_MAC_PACKAGE_CHANGED'});});
test('receipt digest binds the entry list and executable mode',async()=>{const root=await fixture();await chmod(join(root,'payload/main.mjs'),0o755);const receipt=await inventoryPackage(root);assert.equal(receipt.entries.find(x=>x.path==='payload/main.mjs').executable,true);receipt.entries[1].sha256='0'.repeat(64);await assert.rejects(verifyPackage(root,receipt),{code:'SEP_MAC_PACKAGE_RECEIPT'});});
test('only relative symlinks resolving within the package are inventoried',async()=>{const root=await fixture();await symlink('main.mjs',join(root,'payload/current'));const receipt=await inventoryPackage(root);assert.equal(receipt.entries.find(x=>x.path==='payload/current').target,'main.mjs');assert.equal((await verifyPackage(root,receipt)).status,'pass');const external=await fixture();await symlink(join(external,'payload/main.mjs'),join(root,'outside'));await assert.rejects(inventoryPackage(root),{code:'SEP_MAC_PACKAGE_LINK'});});
test('relative escaping and dangling symlinks reject',async()=>{const root=await fixture();await symlink('../../missing',join(root,'payload/bad'));await assert.rejects(inventoryPackage(root),{code:'SEP_MAC_PACKAGE_LINK'});});
test('symlinked package root rejects before scanning',async()=>{const root=await fixture(),alias=root+'-alias';await symlink(root,alias);await assert.rejects(inventoryPackage(alias),{code:'SEP_MAC_PACKAGE_ROOT'});});
