// Test-only factory. This module must never enter a production runtime closure.
export async function openTestInstallerController() {
  throw Object.assign(Error('SEP_INSTALLER_NOT_IMPLEMENTED'), { code: 'SEP_INSTALLER_NOT_IMPLEMENTED' });
}
