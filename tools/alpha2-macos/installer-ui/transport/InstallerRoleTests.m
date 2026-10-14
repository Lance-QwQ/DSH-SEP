// Additional RED definitions for post-admission role replacement. This binary
// is test-only and is supervised by role-regressions.mjs; it installs no data.
#import "InstallerPipeTransport.h"
#import <CommonCrypto/CommonDigest.h>
#import <sys/stat.h>
#import <unistd.h>
static NSString *Hash(NSString *path){NSFileHandle *f=[NSFileHandle fileHandleForReadingAtPath:path];CC_SHA256_CTX c;CC_SHA256_Init(&c);for(;;){NSData *b=[f readDataOfLength:65536];if(!b.length)break;CC_SHA256_Update(&c,b.bytes,(CC_LONG)b.length);}[f closeFile];unsigned char bytes[32];CC_SHA256_Final(bytes,&c);NSMutableString *s=[NSMutableString new];for(int i=0;i<32;i++)[s appendFormat:@"%02x",bytes[i]];return s;}
static BOOL Wait(BOOL(^done)(void),double seconds){NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:seconds];while(!done()&&deadline.timeIntervalSinceNow>0)[[NSRunLoop mainRunLoop]runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];return done();}
int main(int argc,const char **argv){@autoreleasepool{
 if(argc!=5)return 64;[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];NSString *mode=@(argv[1]),*root=@(argv[4]),*node=@(argv[2]),*controller=[root stringByAppendingPathComponent:@"slow.mjs"];NSFileManager *fs=NSFileManager.defaultManager;NSError *error=nil;if(![fs createDirectoryAtPath:root withIntermediateDirectories:NO attributes:nil error:&error])return 65;if(![fs copyItemAtPath:@(argv[3]) toPath:controller error:&error])return 66;
 NSString *controllerHash=Hash(controller),*nodeHash=Hash(node);BOOL fixture=YES;
 if([mode isEqual:@"fifo"]){fixture=[fs removeItemAtPath:controller error:&error]&&mkfifo(controller.fileSystemRepresentation,0600)==0;}
 else if([mode isEqual:@"hardlink"])fixture=link(controller.fileSystemRepresentation,[[root stringByAppendingPathComponent:@"extra-link.mjs"]fileSystemRepresentation])==0;
 else if([mode isEqual:@"writable"])fixture=chmod(controller.fileSystemRepresentation,0666)==0;
 else if([mode isEqual:@"parent-alias"]){NSString *actual=[root stringByAppendingPathComponent:@"actual"],*alias=[root stringByAppendingPathComponent:@"alias"];fixture=[fs createDirectoryAtPath:actual withIntermediateDirectories:NO attributes:nil error:&error]&&[fs moveItemAtPath:controller toPath:[actual stringByAppendingPathComponent:@"slow.mjs"] error:&error]&&symlink(actual.fileSystemRepresentation,alias.fileSystemRepresentation)==0;controller=[alias stringByAppendingPathComponent:@"slow.mjs"];}
 else if([mode isEqual:@"non-executable"]){NSString *copy=[root stringByAppendingPathComponent:@"node-copy"];fixture=[fs copyItemAtPath:node toPath:copy error:&error]&&chmod(copy.fileSystemRepresentation,0644)==0;node=copy;}
 if(!fixture)return 67;
 NSDictionary *config=@{@"contents":root,@"node":@{@"path":node,@"sha256":nodeHash},@"controller":@{@"path":controller,@"sha256":controllerHash}};
 SEPInstallerPipeTransport *transport=[[SEPInstallerPipeTransport alloc]initWithVerifiedConfiguration:config manifestSHA:[@"a" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0]];BOOL started=[transport.snapshot[@"started"]boolValue],passed=NO,drained=!started;__block BOOL terminated=NO;
 if([mode isEqual:@"pending-boolean"]){__block BOOL response=NO;[transport requestOperation:@"preview" input:@{} completion:^(NSDictionary *r){response=[r[@"status"]isEqual:@"pass"];}];id pending=transport.snapshot[@"pending"];passed=started&&[pending isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)pending)==CFBooleanGetTypeID()&&[pending boolValue];if(!Wait(^BOOL{return response;},2))passed=NO;}
 else passed=!started&&[transport.snapshot[@"code"]isEqual:@"SEP_INSTALLER_UI_ROLE_CHANGED"];
 if(started){[transport observeTermination:^(NSInteger code,BOOL signal){terminated=code==0&&!signal;}];[transport requestOperation:@"close" input:@{} completion:^(NSDictionary *r){(void)r;}];drained=Wait(^BOOL{return terminated;},5);}
 NSDictionary *result=@{@"mode":mode,@"status":passed&&drained?@"pass":@"fail",@"started":@(started),@"snapshot":transport.snapshot,@"fixtureDrained":@(drained),@"productInstalled":@NO};NSData *json=[NSJSONSerialization dataWithJSONObject:result options:0 error:nil];fwrite(json.bytes,1,json.length,stdout);fputc('\n',stdout);return passed&&drained?0:1;
}}
