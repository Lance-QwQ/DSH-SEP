process.umask(0o077);
process.env.SEP_LINUX_CONTEXT='1';
await import('./prepare-linux-context-desktop.mjs');
await import('./run-virtual-continuation.mjs');
