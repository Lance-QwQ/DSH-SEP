#import "InstallerUI.h"
// Deliberate RED stub. No production installer, controller or user directories
// are created; native tests must fail until the UI contract is implemented.
@implementation SEPInstallerUI
- (instancetype)initWithTransport:(id<SEPInstallerPrivateTransport>)transport opener:(id<SEPInstallerApplicationOpener>)opener { return [super initWithWindow:nil]; }
- (void)present {}
- (NSString *)phase { return @"not-implemented"; }
- (BOOL)resourcesReleased { return NO; }
@end
