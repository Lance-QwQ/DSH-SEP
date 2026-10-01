import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Rolldown, build } from 'tsdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  importPackageName,
  isBareSpecifier,
  packagedImportsPlugin,
  unpackagedImports,
  type BundleImportPolicy,
} from '../scripts/desktop-bundle-imports.mjs'

const MAIN: BundleImportPolicy = {
  packages: new Set(['electron', 'electron-updater', '@deepseek-ai/dsh-api-gateway']),
  nodeBuiltins: true,
}
const PRELOAD: BundleImportPolicy = { packages: new Set(['electron', 'events', 'timers', 'url']), nodeBuiltins: false }

describe('desktop bundle imports', () => {
  it('names the package behind a bare specifier', () => {
    expect(importPackageName('electron-updater/out/electronHttpExecutor.js')).toBe('electron-updater')
    expect(importPackageName('@deepseek-ai/dsh-api-gateway/stream-protocol')).toBe('@deepseek-ai/dsh-api-gateway')
    expect(importPackageName('ws')).toBe('ws')
  })

  it('tells external specifiers from bundled and virtual module ids', () => {
    expect(isBareSpecifier('electron')).toBe(true)
    expect(isBareSpecifier('@deepseek-ai/dsh-home-paths')).toBe(true)
    expect(isBareSpecifier('node:fs')).toBe(true)
    expect(isBareSpecifier('./helper.js')).toBe(false)
    expect(isBareSpecifier(join(tmpdir(), 'lib', 'index.js'))).toBe(false)
    expect(isBareSpecifier('\0rolldown/runtime')).toBe(false)
  })

  it('accepts Node builtins and packaged dependencies, including their subpaths, for the main process', () => {
    expect(unpackagedImports([
      'node:fs/promises',
      'crypto',
      'electron',
      'electron-updater/out/electronHttpExecutor.js',
      '@deepseek-ai/dsh-api-gateway/stream-protocol',
    ], MAIN)).toEqual([])
  })

  it('rejects Node builtins outside the sandbox polyfill for a preload', () => {
    expect(unpackagedImports(['electron', 'events', 'url', 'node:fs', 'crypto'], PRELOAD)).toEqual(['node:fs', 'crypto'])
  })

  it('reports each specifier the packaged application cannot resolve once, in import order', () => {
    expect(unpackagedImports([
      '@deepseek-ai/dsh-home-paths',
      'ws',
      '@deepseek-ai/dsh-home-paths',
      'electron',
    ], MAIN)).toEqual(['@deepseek-ai/dsh-home-paths', 'ws'])
  })
})

describe('packaged imports plugin', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-bundle-imports-'))
  const entries = {
    static: ['import { app } from "electron";', 'import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";', 'export const home = resolveDshHome(app);'],
    dynamic: ['import { app } from "electron";', 'export const home = () => import("@deepseek-ai/dsh-home-paths").then(m => m.resolveDshHome(app));'],
    require: ['import { app } from "electron";', 'export const home = () => require("@deepseek-ai/dsh-home-paths").resolveDshHome(app);'],
    builtin: ['import { contextBridge } from "electron";', 'import { readFileSync } from "node:fs";', 'contextBridge.exposeInMainWorld("x", readFileSync);'],
  } as const
  for (const [name, lines] of Object.entries(entries)) writeFileSync(join(root, `${name}.js`), lines.join('\n'))
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  async function generate(entry: keyof typeof entries, policy: BundleImportPolicy, format: 'esm' | 'cjs' = 'esm'): Promise<Rolldown.RolldownOutput> {
    // Every import stays external, which is what an unresolved workspace lib/ output produces.
    const bundle = await Rolldown.rolldown({
      input: join(root, `${entry}.js`),
      platform: 'node',
      external: () => true,
      logLevel: 'silent',
      plugins: [packagedImportsPlugin(policy)],
    })
    try {
      return await bundle.generate({ format })
    } finally {
      await bundle.close()
    }
  }

  const unshipped = /imports @deepseek-ai\/dsh-home-paths, which the packaged application does not ship/u

  it('fails the bundle whose static import the packaged application does not ship', async () => {
    await expect(generate('static', { ...MAIN, packages: new Set(['electron']) })).rejects.toThrow(unshipped)
  })

  it('fails the bundle whose dynamic import() the packaged application does not ship', async () => {
    await expect(generate('dynamic', { ...MAIN, packages: new Set(['electron']) })).rejects.toThrow(unshipped)
  })

  it('fails the CommonJS bundle whose require() the packaged application does not ship', async () => {
    await expect(generate('require', { ...MAIN, packages: new Set(['electron']) }, 'cjs')).rejects.toThrow(unshipped)
  })

  it('fails a preload bundle that requires a Node builtin the sandbox does not polyfill', async () => {
    await expect(generate('builtin', PRELOAD, 'cjs')).rejects.toThrow(
      /builtin\.js imports node:fs, which the packaged application does not ship\. /u,
    )
    await expect(generate('builtin', PRELOAD, 'cjs')).rejects.toThrow(
      /This bundle may leave only electron, events, timers, url as bare imports/u,
    )
  })

  it('passes the bundles whose external imports are all packaged', async () => {
    const policy = { ...MAIN, packages: new Set(['electron', '@deepseek-ai/dsh-home-paths']) }
    for (const entry of ['static', 'dynamic'] as const) {
      const output = await generate(entry, policy)
      expect(output.output.map(chunk => chunk.fileName)).toEqual([`${entry}.js`])
    }
    const output = await generate('require', policy, 'cjs')
    expect(output.output.map(chunk => chunk.fileName)).toEqual(['require.js'])
  })
})

describe('compiled desktop input', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-compiled-input-'))
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  for (const extension of ['ts', 'tsx', 'mts', 'cts']) {
    it(`rejects a ${extension} dependency reached from a compiled JavaScript entry`, async () => {
      const entry = join(root, `entry-${extension}.js`)
      writeFileSync(entry, `export { value } from "./dependency.${extension}";`)
      writeFileSync(join(root, `dependency.${extension}`), 'export const value = 42;')
      await expect(Rolldown.rolldown({
        input: entry,
        platform: 'node',
        logLevel: 'silent',
        plugins: [packagedImportsPlugin({ packages: new Set(), nodeBuiltins: true })],
      }).then(async bundle => {
        try { return await bundle.generate({ format: 'esm' }) }
        finally { await bundle.close() }
      })).rejects.toThrow(/DESKTOP_SOURCE_PLANE_LEAK/u)
    })
  }

  it('rejects a tsconfig path that redirects a compiled dependency into source', async () => {
    const entry = join(root, 'entry-paths.js')
    writeFileSync(entry, 'export { value } from "fixture-dependency";')
    writeFileSync(join(root, 'redirected.ts'), 'export const value = 7;')
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { 'fixture-dependency': ['./redirected.ts'] } } }))
    await expect(build({
      config: false,
      cwd: root,
      entry: [entry],
      outDir: join(root, 'output-paths'),
      format: ['esm'],
      platform: 'node',
      dts: false,
      plugins: [packagedImportsPlugin({ packages: new Set(), nodeBuiltins: true })],
    })).rejects.toThrow(/DESKTOP_SOURCE_PLANE_LEAK/u)
  })

  it('bundles compiled JavaScript without reading a neighboring tsconfig alias', async () => {
    const entry = join(root, 'entry-compiled.js')
    writeFileSync(join(root, 'redirected.ts'), 'export const value = 7;')
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { 'fixture-dependency': ['./redirected.ts'] } } }))
    writeFileSync(entry, 'export { value } from "fixture-dependency";')
    const dependency = join(root, 'node_modules', 'fixture-dependency')
    mkdirSync(dependency, { recursive: true })
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'fixture-dependency', type: 'module', main: './index.js' }))
    writeFileSync(join(dependency, 'index.js'), 'export const value = 42;')
    const outputs = await build({
      config: false,
      tsconfig: false,
      inputOptions: { tsconfig: false },
      deps: { alwaysBundle: ['fixture-dependency'] },
      cwd: root,
      entry: [entry],
      outDir: join(root, 'output-compiled'),
      format: ['esm'],
      platform: 'node',
      dts: false,
      plugins: [packagedImportsPlugin({ packages: new Set(), nodeBuiltins: true })],
    })
    expect(outputs.flatMap(output => output.chunks).some(chunk => chunk.type === 'chunk' && chunk.code.includes('42'))).toBe(true)
  })
})
