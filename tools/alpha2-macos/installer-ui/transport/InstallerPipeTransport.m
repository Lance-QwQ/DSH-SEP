#import "InstallerPipeTransport.h"

// Intentional RED stub. No subprocess is created before native contracts have
// demonstrated that the missing implementation fails on an actual Mac.
@implementation SEPInstallerPipeTransport
- (instancetype)initWithVerifiedConfiguration:(NSDictionary *)configuration manifestSHA:(NSString *)manifestSHA {
 (void)configuration; (void)manifestSHA; return [super init];
}
- (void)requestOperation:(NSString *)operation input:(NSDictionary *)input completion:(void (^)(NSDictionary *))completion {
 (void)operation; (void)input;
 completion(@{@"status":@"blocked",@"phase":@"blocked",@"code":@"SEP_INSTALLER_TRANSPORT_NOT_IMPLEMENTED"});
}
- (void)observeTermination:(void (^)(NSInteger,BOOL))observer { (void)observer; }
- (NSDictionary *)snapshot { return @{@"started":@NO,@"phase":@"blocked",@"code":@"SEP_INSTALLER_TRANSPORT_NOT_IMPLEMENTED",@"requestsDispatched":@0,@"stdoutEOF":@NO,@"processExited":@NO,@"terminationDelivered":@NO,@"stderrBytesBounded":@0}; }
@end
