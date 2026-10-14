#import "FixedApplicationOpener.h"
// Deliberate RED stub, no LaunchServices dispatch until native RED is recorded.
@implementation SEPFixedApplicationOpener
- (instancetype)initWithVerifiedConfiguration:(NSDictionary *)configuration {(void)configuration;return[super init];}
- (void)openInstalledApplication:(NSURL *)url completion:(void(^)(BOOL))completion {(void)url;completion(NO);}
@end
