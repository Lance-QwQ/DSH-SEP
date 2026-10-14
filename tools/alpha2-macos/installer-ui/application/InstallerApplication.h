#import "../native/InstallerUI.h"
@interface SEPInstallerApplication : NSObject <NSApplicationDelegate>
- (instancetype)initWithUI:(SEPInstallerUI *)ui;
- (void)installMenu;
- (void)requestQuit:(id)sender;
#ifdef SEP_INSTALLER_APPLICATION_TESTING
// Compile-time test seam only; not an authority/command-line/renderer API.
- (instancetype)initWithUI:(SEPInstallerUI *)ui terminationRequest:(void (^)(void))terminationRequest;
#endif
@end
