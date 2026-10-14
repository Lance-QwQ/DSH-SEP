// RED scaffold. This trusted controller is not connected to a product entry.
export async function openInstallerController() {
  throw Object.assign(Error('SEP_INSTALLER_NOT_IMPLEMENTED'), { code: 'SEP_INSTALLER_NOT_IMPLEMENTED' });
}
