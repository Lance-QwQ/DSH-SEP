import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, access, copyFile, cp, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildModules, rewriteOwnedImports, COMPONENTS } from '../build-modules.mjs';

const work=resolve(process.env.SEP_BUNDLE_TEST_ROOT);
const repo=resolve(process.env.SEP_BUNDLE_REPO);
const program=resolve(process.env.SEP_BUNDLE_SOURCE_PROGRAM);
const rootManifest=JSON.parse(await readFile(join(repo,'package.json'),'utf8'));
const options=outputRoot=>({programRoot:program,outputRoot,rootManifest,licenseRoot:repo});
const absent=path=>assert.rejects(access(path),error=>error.code==='ENOENT');
async function copiedProgram() {
  const base=await mkdtemp(join(work,'program-'));
  await copyFile(join(program,'graph.json'),join(base,'graph.json'));
  const graph=JSON.parse(await readFile(join(program,'graph.json'),'utf8'));
  for(const row of graph.files.filter(row=>Object.keys(COMPONENTS).includes(row.path.split('/')[1]))) {
    await mkdir(join(base,row.path,'..'),{recursive:true});
    await copyFile(join(program,row.path),join(base,row.path));
  }
  return base;
}

test('module remapping preserves runtime identity and leaves ordinary producer strings intact', async () => {
  const base=await mkdtemp(join(work,'remap-'));
  const entry='bundle/modules/consumer/src/index.mjs';
  await mkdir(join(base,'bundle/modules/owned'),{recursive:true});
  await mkdir(join(base,'bundle/modules/consumer/src'),{recursive:true});
  await writeFile(join(base,'bundle/modules/owned/index.mjs'),'export const token={};\n');
  const source="import {token} from 'private-sep'; export const producer='private-sep'; export const same=token===(await import('private-sep')).token;\n";
  const {text}=await rewriteOwnedImports(source,entry,[{folder:'owned',manifest:{name:'private-sep',main:'./index.mjs'}}]);
  await writeFile(join(base,entry),text);
  const loaded=await import(pathToFileURL(join(base,entry)));
  assert.equal(loaded.producer,'private-sep');
  assert.equal(loaded.same,true);
});

test('unknown owned package subpath refuses remapping instead of guessing a file', async () => {
  await assert.rejects(rewriteOwnedImports("import 'private-sep/absent';",'bundle/modules/a/index.mjs',[{folder:'owned',manifest:{name:'private-sep',main:'./index.mjs',exports:{'.':'./index.mjs'}}}]), /BUNDLE_OWN_EXPORT_MISSING/);
});

test('pinned graph can generate complete runtime into a new directory', async () => {
  const base=await mkdtemp(join(work,'build-'));
  const result=await buildModules(options(join(base,'output')));
  assert.equal(result.modules,10);
  await access(join(base,'output/bundle/modules/tool-worker/worker.js'));
  const inventory=JSON.parse(await readFile(join(base,'output/bundle/contracts/modules.json'),'utf8'));
  assert.equal(inventory.businessActivationAllowed,false);
  assert.equal(inventory.upstreamOnly.every(row=>row.runtimeEnabled===false),true);
});

test('a changed graph is rejected before creating an output', async () => {
  const base=await mkdtemp(join(work,'changed-graph-'));
  await writeFile(join(base,'graph.json'),(await readFile(join(program,'graph.json'),'utf8'))+'\n');
  const out=join(base,'output');
  await assert.rejects(buildModules({...options(out),programRoot:base}),/BUNDLE_GRAPH_HASH/);
  await absent(out);
});

test('a modified companion file is rejected before publishing any output', async () => {
  const base=await copiedProgram();
  const file=join(base,'store/p0411/worker.js');
  await writeFile(file,(await readFile(file,'utf8'))+'\n// changed\n');
  const out=join(base,'output');
  await assert.rejects(buildModules({...options(out),programRoot:base}),/BUNDLE_SOURCE_HASH/);
  await absent(out);
});

test('existing output is refused and its content remains intact', async () => {
  const base=await mkdtemp(join(work,'existing-'));
  await writeFile(join(base,'sentinel.txt'),'keep me');
  await assert.rejects(buildModules(options(base)),/BUNDLE_OUTPUT_EXISTS/);
  assert.equal(await readFile(join(base,'sentinel.txt'),'utf8'),'keep me');
});

test('an aliased output parent is refused', async () => {
  const base=await mkdtemp(join(work,'alias-'));
  await mkdir(join(base,'real'));
  await symlink(join(base,'real'),join(base,'alias'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(buildModules(options(join(base,'alias/output'))),/BUNDLE_PATH_ALIAS/);
  await absent(join(base,'real/output'));
});

test('licensing cannot silently change during runtime preparation', async () => {
  const base=await mkdtemp(join(work,'license-'));
  await writeFile(join(base,'LICENSE'),'different license');
  const out=join(base,'output');
  await assert.rejects(buildModules({...options(out),licenseRoot:base}),/BUNDLE_LICENSE_HASH/);
  await absent(out);
});

test('privacy cleanup removes only CSS-region build comments while preserving executable bytes and line positions', async () => {
  const base=await mkdtemp(join(work,'comments-'));
  await buildModules(options(join(base,'output')));
  const file='bundle/modules/ui-settings-memory/lib/client.js';
  const original=await readFile(join(program,'store/p0601/lib/client.js'),'utf8');
  const cleaned=await readFile(join(base,'output',file),'utf8');
  assert.equal(/[A-Z]:[\\/]AIData/.test(cleaned),false,'a local build path leaked into the consumer asset');
  const strip=source=>source.split(/(?<=\n)/).filter(line=>!line.trimStart().startsWith('//#region \\0dsh-css:')).join('');
  assert.equal(strip(cleaned),strip(original),'a non-CSS-region byte changed');
  assert.equal(cleaned.split('\n').length,original.split('\n').length);
  const inventory=JSON.parse(await readFile(join(base,'output/bundle/contracts/modules.json'),'utf8'));
  const record=inventory.modules.flatMap(module=>module.files).find(row=>row.path===file);
  assert.equal(record.sanitizedBuildComments,3);
  assert.equal(record.remappedImports.length,0);
});
