#import "InstallerApplication.h"
// Deliberate native RED stub. Not a production application entry.
@implementation SEPInstallerApplication
- (instancetype)initWithUI:(SEPInstallerUI *)ui {(void)ui;return [super init];}
#ifdef SEP_INSTALLER_APPLICATION_TESTING
- (instancetype)initWithUI:(SEPInstallerUI *)ui terminationRequest:(void (^)(void))terminationRequest {(void)terminationRequest;return [self initWithUI:ui];}
#endif
- (void)installMenu {}
- (void)requestQuit:(id)sender {(void)sender;}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {(void)sender;return NSTerminateNow;}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {(void)sender;return YES;}
@end
