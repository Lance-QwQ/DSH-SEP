/** Mac publication/rollback is not integrated. Never invoke the Windows-layout preparer. */
export function macInstallUnavailable(){const code='SEP_MAC_UPDATE_INSTALL_NOT_INTEGRATED';throw Object.assign(Error(code),{code});}
