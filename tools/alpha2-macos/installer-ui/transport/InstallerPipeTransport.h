#import "../native/InstallerUI.h"

// Internal constructor only: configuration must be the immutable result of
// SEPInstallerVerifyMainBundle, not renderer/model/HTTP/argv configuration.
@interface SEPInstallerPipeTransport : NSObject <SEPInstallerPrivateTransport>
- (instancetype)initWithVerifiedConfiguration:(NSDictionary *)configuration manifestSHA:(NSString *)manifestSHA;
// Bounded classification/counts only. No nonce, paths, stderr, plan or payload.
- (NSDictionary *)snapshot;
@end
