// Trusted release operator. The caller verifies the official carrier and the
// pinned dependency installer before supplying these canonical inputs.
import assert from 'node:assert/strict';
import {realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectInputTree,assembleParserRuntime} from '../parser-integration/runtime.mjs';
export async function assembleInstalledParser({destination,resources,source,helper,owner,dependencies,captured}){
 assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
 for(const p of [resources,source,helper,owner,dependencies,captured])assert.equal(await realpath(p),p);
 const runtime=join(resources,'runtime/primary-runtime/dependencies'),node=join(runtime,'node/bin/node'),python=join(runtime,'python');
 const file=async path=>{const hash=createHash('sha256');for await(const b of createReadStream(path))hash.update(b);return {path,sha256:hash.digest('hex')};};
 const inputs={node:await file(node),owner:await file(owner),helper:await file(helper),python:{root:python,sha256:(await inspectInputTree(python)).sha256},dependencies:{root:dependencies,sha256:(await inspectInputTree(dependencies)).sha256},capturedRoot:join(captured,'bundle/modules/system-enhancement-package/src')};
 const assembled=await assembleParserRuntime({destination,inputs});
 return {root:destination,...assembled,scope:'fixed native parser runtime; official carrier and dependency archive proofs are separate',inputs:Object.fromEntries(['node','owner','helper','python','dependencies'].map(k=>[k,inputs[k].sha256]))};
}
