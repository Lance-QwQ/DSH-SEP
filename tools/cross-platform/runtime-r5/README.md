# Native SEP runtime validation

This is an isolated assembly/health harness for the fixed DSH rc.2 and SEP source snapshot. It is not a distributable installer and does not modify a daily installation.

Set absolute `SEP_NATIVE_SOURCE` to a fully built native source tree and `SEP_NATIVE_OUTPUT` to a new real output directory. Run `node packaging/native-runtime/run-native.mjs`. Only Linux and macOS are supported by this validation driver. Large output and cache directories must remain on the user's designated data volume.

The program closure is copied from native package files into independent regular files with SHA-256 hashes, POSIX modes and explicit internal links. No development dependencies or private `.env` files are packaged. Source dependencies must already be installed and built. The loader bridge is deliberately pinned to node-addon-native-custom-loader 0.1.6 and the matching platform binding 0.1.6; an absent or ambiguous package refuses assembly.

`native-health.mjs` first runs the existing controlled empty-store health check without modifying the candidate. It then enables P1 and configures the plugin group and SEP branding in the synthetic Profile, testing local budget/memory settings and two controlled start/stop cycles. No model key, paid request, private session, or existing user store is used. The empty budget test does not prove retention of nonzero historical consumption. Plugin configuration/startup does not prove every plugin feature. Interactive Electron, OS permissions, an installer, actual update/rollback, and Linux/macOS public release readiness remain separate acceptance work.

Raw failure samples are evidence, not erased by a later pass. Successful health requires actual owned host exit after runtime.close. Assembly failure may retain a partial create-only output directory for inspection; rerun with a new output path.