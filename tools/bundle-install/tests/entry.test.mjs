import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(process.env.SEP_BUNDLE_REPO);
const work = resolve(process.env.SEP_BUNDLE_TEST_ROOT);
const official = createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS), 'package.json'));
const { boot, initProfile, readProfileManifest, bundlePatchPaths, loadOverlayPatches, composeEntries } = await import(pathToFileURL(official.resolve('@deepseek-ai/dsh-app-boot')).href);
const { default: PluginManager } = await import(pathToFileURL(official.resolve('@deepseek-ai/dsh-plugin-manager')).href);
const contexts = [];
after(async () => { for (const ctx of contexts.reverse()) await ctx.fiber.dispose(); });

async function managerFixture() {
  const home = await mkdtemp(join(work, 'profile-'));
  const dir = join(home, 'profiles', 'bundle-entry');
  const anchor = join(home, 'package.json');
  await writeFile(anchor, '{"name":"isolated-official-installation","dependencies":{}}\n');
  initProfile(dir, []);
  await writeFile(join(dir, 'cordis.yml'), '[]\n');
  const profile = {
    name: 'bundle-entry', startedBundles: [], dir,
    patchPath: join(dir, 'cordis.patch.yml'), installAnchor: anchor,
    cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
    packageManager: { command: process.execPath, args: [process.env.SEP_TEST_PNPM], env: {
      npm_config_cache: join(work, 'cache'), TMP: work, TEMP: work,
    } },
  };
  const ctx = await boot('dsh', join(dir, 'cordis.yml'), [], ctx => {
    ctx.provide('profileContext', profile);
    ctx.provide('appReady', { onReady(listener) { listener(); return () => {}; } });
  });
  contexts.push(ctx);
  await ctx.plugin(PluginManager, { registry: 'https://registry.npmjs.org/', fallbackRegistries: [] });
  return { ctx, manager: ctx.pluginManager, dir };
}

test('official manager accepts the repository root as an installable bundle', async () => {
  const { manager } = await managerFixture();
  const result = await manager.inspect(repo);
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  assert.equal(result.kind, 'path');
  assert.equal(result.name, 'dsh-sep-bundle');
  assert.equal(result.bundle, true);
});

test('official patch composition adds the admission entry without overriding host services', async () => {
  const manifest = readProfileManifest('dsh', repo);
  const patches = bundlePatchPaths(repo, manifest.dsh.bundle).flatMap(file => loadOverlayPatches('dsh', file));
  const original = [
    { id: 'compaction-basic', name: 'native-compaction', config: { auto: true, thresholdRatio: 0.8 } },
    { id: 'storage-json', name: 'native-storage', config: { root: 'unchanged' } },
    { id: 'another-user-plugin', name: 'another-user-plugin', config: { enabled: true } },
  ];
  const rows = composeEntries([[{ insert: original }], patches]);
  for (const row of original) assert.deepEqual(rows.find(value => value.id === row.id), row);
  assert.equal(rows.filter(value => value.id === 'sep-bundle-installation').length, 1);
});

test('official Loader exposes pending admission without activating SEP business modules', async () => {
  const manifest = readProfileManifest('dsh', repo);
  const patches = bundlePatchPaths(repo, manifest.dsh.bundle).flatMap(file => loadOverlayPatches('dsh', file));
  const home = await mkdtemp(join(work, 'loader-'));
  const configPath = join(home, 'cordis.yml');
  await writeFile(configPath, '[]\n');
  const native = Object.freeze({ identity: 'original-native-engine' });
  const ctx = await boot('dsh', configPath, patches, ctx => ctx.provide('compaction', native));
  contexts.push(ctx);
  assert.equal(ctx.sepBundleInstallation.state, 'pending');
  assert.equal(ctx.sepBundleInstallation.businessEnabled, false);
  assert.equal(ctx.sepBundleInstallation.reason, 'SEP_BUNDLE_ADAPTATION_PENDING');
  assert.equal(ctx.compaction, native);
  assert.equal(ctx.get('suiteEnhancements'), undefined);
  const entry = [...ctx.loader.entries()].find(entry => entry.options.id === 'sep-bundle-installation');
  assert.ok(entry, 'bundle row did not reach the real Loader');
  assert.ok(entry.fiber, 'bundle row was not activated');
  await entry.fiber.dispose();
  assert.equal(ctx.get('sepBundleInstallation'), undefined);
  assert.equal(ctx.compaction, native);
});

test('real Loader keeps enable intent pending and preserves non-default native compaction and existing state', async () => {
  const home=await mkdtemp(join(work,'configured-loader-'));
  const configPath=join(home,'cordis.yml'),ledgerPath=join(home,'budget.json'),memoryPath=join(home,'memory.json');
  await writeFile(configPath,'[]\n');
  const budgetBytes=Buffer.from('{"synthetic-existing-budget":"preserve"}\n'),memoryBytes=Buffer.from('{"synthetic-existing-memory":"preserve"}\n');
  await writeFile(ledgerPath,budgetBytes);await writeFile(memoryPath,memoryBytes);
  const native=Object.freeze({identity:'user-native-engine',config:Object.freeze({auto:true,thresholdRatio:0.63,retainRatio:0.21})});
  const rows=[{insert:[{id:'sep-bundle-installation',name:pathToFileURL(join(repo,'bundle/lib/index.js')).href,config:{enabled:true,budget:{sessionDefaultLimitCny:25}}}]}];
  const ctx=await boot('dsh',configPath,rows,ctx=>ctx.provide('compaction',native));contexts.push(ctx);
  assert.equal(ctx.sepBundleInstallation.configuration.enabled,true);
  assert.equal(ctx.sepBundleInstallation.configurationApplied,false);
  assert.equal(ctx.sepBundleInstallation.businessEnabled,false);
  assert.equal(ctx.get('suiteEnhancements'),undefined);
  assert.equal(ctx.compaction,native);
  assert.deepEqual(await readFile(ledgerPath),budgetBytes);assert.deepEqual(await readFile(memoryPath),memoryBytes);
  const entry=[...ctx.loader.entries()].find(row=>row.options.id==='sep-bundle-installation');
  await entry.fiber.dispose();assert.equal(ctx.compaction,native);
});
