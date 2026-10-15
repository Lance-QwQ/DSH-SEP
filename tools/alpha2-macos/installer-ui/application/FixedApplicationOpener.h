#import "../native/InstallerUI.h"
@interface SEPFixedApplicationOpener : NSObject <SEPInstallerApplicationOpener>
- (instancetype)initWithVerifiedConfiguration:(NSDictionary *)configuration;
@end
