import { defineConfig } from 'tsdown'

/** Keep the path-loaded worker self-contained and include it in the host build. */
export default defineConfig(({ env }) => env?.DSH_BUILD_FACE === 'client' ? [] :
  ['index', 'diff-worker'].map(name => ({
    entry: [`lib/types/${name}.js`],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  })))
