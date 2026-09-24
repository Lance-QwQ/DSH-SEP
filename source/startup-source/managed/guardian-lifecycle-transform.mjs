// Reproduce the already-tested onSpawn and explicit manual-start changes.
// This module transforms text only; it never edits an installed runtime.
export function guardianLifecycleTransform(source) {
  let text = source;
  const change = (old, next) => {
    if (text.split(old).length !== 2) throw Error('GUARDIAN_LIFECYCLE_BUILD_ANCHOR_CHANGED');
    text = text.replace(old, next);
  };
  change("['beforeStart', 'readiness', 'gracefulStop', 'afterExit', 'onEvent']", "['beforeStart', 'readiness', 'gracefulStop', 'afterExit', 'onEvent', 'onSpawn']");
  change(`      }, readinessTimeoutMs);
      return run;`, `      }, readinessTimeoutMs);
      // Observe the actual owned handle before asynchronous spawn persistence.
      // This also covers a child that exits before sending any ready message.
      try {
        const observed = options.onSpawn?.({ child, generation: run.generation });
        if (observed && typeof observed.then === 'function') {
          Promise.resolve(observed).catch(() => {});
          throw fault('GUARDIAN_SPAWN_OBSERVER_ASYNC');
        }
      } catch (error) {
        run.errorCode = error.code ?? 'GUARDIAN_SPAWN_OBSERVER_FAILED';
        run.ready.reject(fault('GUARDIAN_NOT_READY')); run.abort.abort(); forceOwned(run);
      }
      return run;`);
  change(`    async function start() {
      stopRequested = false;`, `    async function start(options = {}) {
      if (!options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some(key => key !== 'manual')
        || (options.manual !== undefined && typeof options.manual !== 'boolean')) throw fault('GUARDIAN_OPTIONS_INVALID');
      const manual = options.manual === true;
      stopRequested = false;`);
  change(`        const run = await enqueue(() => launch(state.intent === 'active' && state.generation > 0, requestedIntervention));`, `        const run = await enqueue(async () => {
          if (manual && !current && !closed && !closing && !stopRequested && requestedIntervention === intervention) {
            await persist({ restarts: [], intent: 'manual-stop', reason: null }, 'manual-start-requested');
          }
          return launch(state.intent === 'active' && state.generation > 0, requestedIntervention);
        });`);
  return text;
}
