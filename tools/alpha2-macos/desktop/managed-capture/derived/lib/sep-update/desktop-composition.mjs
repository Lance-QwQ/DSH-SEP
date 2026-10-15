/** Required Host rows for the fixed empty profile; optional user plugins are outside this check. */
const required = [
 '@deepseek-ai/dsh-api-remotes',
 '@deepseek-ai/dsh-plugin-manager',
 '@deepseek-ai/dsh-client-product-analytics',
 '@deepseek-ai/dsh-host-product-telemetry-otel',
 '@deepseek-ai/dsh-client-ui-settings-memory',
];
/** Reject missing, disabled or unactivated services before declaring desktop health. */
export function assertRequiredDesktopEntries(snapshot) {
 const fail = () => { throw Error('SEP_HEALTH_COMPOSITION'); };
 if (!Array.isArray(snapshot?.entries)) fail();
 for (const name of required) {
  const rows = snapshot.entries.filter(row => row?.moduleName === name);
  if (rows.length !== 1 || rows[0].enabled !== true || rows[0].fiberPhase !== 'active') fail();
 }
}
