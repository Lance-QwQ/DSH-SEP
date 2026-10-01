// Only bounded machine classifications cross the startup UI boundary. Adding a
// new code requires an explicit change here; prefixes and arbitrary prose are
// deliberately not accepted.
const HOST_CODES = new Set([
  'SEP_HOST_START_FAILED', 'SEP_HOST_IDENTITY_INVALID', 'SEP_HOST_VERSION_INVALID',
  'SEP_HOST_SHUTDOWN_TIMEOUT', 'SEP_HOST_SHUTDOWN_FAILED', 'SEP_HOST_STARTUP_FAILED',
  'P2_LOCKED', 'P2_UNINITIALIZED', 'P2_COVERAGE_UNKNOWN', 'P2_RECOVERY_REQUIRED',
  'P2_DATA_DRIFT', 'P2_JOURNAL_INVALID', 'P2_STORAGE_MISMATCH', 'P2_STORAGE_UNVERIFIED',
  'P2_CONFIG', 'P2_FENCE_LOST', 'DATA_LOCKED', 'RECOVERY_UNAVAILABLE',
]);
export const safeHostCode = value => typeof value === 'string' && HOST_CODES.has(value) ? value : undefined;
export function fatalPayload(error) {
  const code = safeHostCode(error?.code) ?? safeHostCode(error?.message) ?? 'SEP_HOST_START_FAILED';
  return { type: 'fatal', code, message: code };
}
export function startupFailure(run) {
  const error = Object.assign(Error('GUARDIAN_NOT_READY'), { code: 'GUARDIAN_NOT_READY' });
  const hostCode = safeHostCode(run?.hostCode);
  if (hostCode) error.hostCode = hostCode;
  return error;
}
