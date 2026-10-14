#import <Foundation/Foundation.h>

/* Compile with SEP_INSTALLER_MANIFEST_SHA256 fixed to INSTALLER.json bytes.
 * No path or executable can be supplied through argv or the environment.
 * Returns immutable, internally verified fixed-role configuration, or nil.
 * The caller owns no descriptor and no process has been spawned on return. */
FOUNDATION_EXPORT NSDictionary *SEPInstallerVerifyMainBundle(int argc, NSString **failure);
