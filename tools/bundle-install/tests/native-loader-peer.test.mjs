import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {adaptHostDependencies}=await import(pathToFileURL(join(process.env.SEP_SOURCE_REPO,'tools/bundle-install/adapt-host-dependencies.mjs')));
const manifest=JSON.parse(await readFile(join(process.env.SEP_BUNDLE_REPO,'package.json')));
const loader='@deepseek-ai/cordis-plugin-loader';
test('new Loader peer rejects an unknown range and missing optional metadata',()=>{
 const input=structuredClone(manifest);input.peerDependencies[loader]='*';assert.throws(()=>adaptHostDependencies(input),/BUNDLE_HOST_PEER_RANGE/);
 const missing=structuredClone(manifest);delete missing.peerDependenciesMeta[loader];assert.throws(()=>adaptHostDependencies(missing),/BUNDLE_HOST_PEER_META/);
});
test('new Loader peer optionality must be exactly true, not another truthy value',()=>{
 const input=structuredClone(manifest);input.peerDependenciesMeta[loader]={optional:1};assert.throws(()=>adaptHostDependencies(input),/BUNDLE_HOST_PEER_META/);
});
