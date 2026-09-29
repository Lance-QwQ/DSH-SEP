import { defineConfig } from 'tsdown'

/** Publish the durable validator alongside the task service and diagnostic fold. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/invariant.js', 'lib/types/fold.js', 'lib/types/format.js'],
})
