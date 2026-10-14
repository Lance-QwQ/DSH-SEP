#import "installer-admission.h"

/* RED scaffold. No product entry invokes this unimplemented boundary. */
NSDictionary *SEPInstallerVerifyMainBundle(int argc, NSString **failure) {
  (void)argc;
  *failure=@"SEP_INSTALLER_ADMISSION_NOT_IMPLEMENTED";
  return nil;
}
