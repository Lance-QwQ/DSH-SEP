# DSH SEP branding

This Cordis client plugin supplies `sidebar.brand.name`. It keeps the official DeepSeek / HARNESS artwork and adds a separate SEP background. The host entry (`lib/index.js`) is presentation-only; the browser entry is `lib/client.js` through DSH's module loader. No user configuration is required.

## Current layout

The HARNESS background remains 52 × 14 SVG units; SEP is 32 × 14 as requested. Both have a radius of 2. Their top edge is at y=5.5 in the same 24-unit canvas. The SEP text retains its 12-unit font and is centered horizontally. The backgrounds remain separate.

The full name uses one 194 × 24 viewBox. It may shrink uniformly when the sidebar has less space, preserving their respective widths and equal heights. This avoids clipping SEP at DSH's 264-pixel minimum sidebar width. Sidebar collapse behavior, titlebar dragging and window controls remain owned by DSH.

The plugin owns no user data, network connection, or model request. Unloading it restores the official brand slot occupant.

## Build and compatibility

This isolated correction was built with the existing DSH client build helper against the selected DSH 0.1.7-rc.2 runtime dependencies. Package version and historical source provenance remain unchanged here; integration into a new managed release must update its graph fingerprint and follow the deployment approval flow. Copying this directory into a running managed installation is not the deployment procedure.
