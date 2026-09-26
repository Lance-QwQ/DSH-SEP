import { defineConfig } from 'tsdown'
import { copyFile, mkdir } from 'node:fs/promises'

// These reviewed ESM sources keep their adjacent .d.mts types; tsc does not copy them.
await mkdir(new URL('./lib/types/', import.meta.url), { recursive: true })
for (const name of ['sep-host-lifecycle.mjs', 'startup-diagnostic.mjs']) {
  await copyFile(new URL(`./src/${name}`, import.meta.url), new URL(`./lib/types/${name}`, import.meta.url))
}
await copyFile(new URL('./src/sep-policy.json', import.meta.url), new URL('./lib/sep-policy.json', import.meta.url))

export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
