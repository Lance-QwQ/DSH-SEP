#import "FixedApplicationOpener.h"
#import <Security/Security.h>
#import <CommonCrypto/CommonDigest.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <limits.h>
#import <pwd.h>
#import <unistd.h>
#import <errno.h>

static BOOL SEPOpenerHash(NSString *value) {
 if (![value isKindOfClass:NSString.class] || value.length != 64) return NO;
 return [value rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet]].location == NSNotFound;
}
static BOOL SEPOpenerCanonical(NSString *path) {
 char resolved[PATH_MAX];
 return path.fileSystemRepresentation && realpath(path.fileSystemRepresentation, resolved) && [path isEqualToString:[NSString stringWithUTF8String:resolved]];
}
static BOOL SEPOpenerIdentity(struct stat a, struct stat b) {
 return a.st_dev==b.st_dev && a.st_ino==b.st_ino && a.st_mode==b.st_mode && a.st_uid==b.st_uid && a.st_nlink==b.st_nlink && a.st_size==b.st_size && a.st_mtimespec.tv_sec==b.st_mtimespec.tv_sec && a.st_mtimespec.tv_nsec==b.st_mtimespec.tv_nsec && a.st_ctimespec.tv_sec==b.st_ctimespec.tv_sec && a.st_ctimespec.tv_nsec==b.st_ctimespec.tv_nsec;
}
static BOOL SEPOpenerDocument(NSString *path, NSString *expected) {
 if (!SEPOpenerHash(expected) || !SEPOpenerCanonical(path)) return NO;
 int fd=open(path.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);
 if(fd<0)return NO;
 BOOL valid=NO;struct stat before,after,named;char opened[PATH_MAX];
 do {
  if(fstat(fd,&before)!=0 || !S_ISREG(before.st_mode) || before.st_nlink!=1 || (before.st_uid!=geteuid() && before.st_uid!=0) || (before.st_mode&0022)!=0 || before.st_size<=0 || before.st_size>262144) break;
  if(fcntl(fd,F_GETPATH,opened)!=0 || ![path isEqualToString:[NSString stringWithUTF8String:opened]] || lstat(path.fileSystemRepresentation,&named)!=0 || !SEPOpenerIdentity(before,named)) break;
  CC_SHA256_CTX context;CC_SHA256_Init(&context);unsigned char buffer[8192],digest[CC_SHA256_DIGEST_LENGTH];off_t readBytes=0;BOOL readable=YES;
  for(;;){ssize_t count=read(fd,buffer,sizeof(buffer));if(count<0&&errno==EINTR)continue;if(count<0){readable=NO;break;}if(count==0)break;readBytes+=count;if(readBytes>262144){readable=NO;break;}CC_SHA256_Update(&context,buffer,(CC_LONG)count);}
  if(!readable || readBytes!=before.st_size || fstat(fd,&after)!=0 || !SEPOpenerIdentity(before,after) || lstat(path.fileSystemRepresentation,&named)!=0 || !SEPOpenerIdentity(after,named))break;
  CC_SHA256_Final(digest,&context);NSMutableString *actual=[NSMutableString stringWithCapacity:64];for(NSUInteger i=0;i<sizeof(digest);i++)[actual appendFormat:@"%02x",digest[i]];
  valid=[actual isEqualToString:expected] && SEPOpenerCanonical(path);
 } while(NO);
 close(fd);return valid;
}
static BOOL SEPOpenerSigned(NSURL *url) {
 SecStaticCodeRef code=NULL;OSStatus status=SecStaticCodeCreateWithPath((__bridge CFURLRef)url,kSecCSDefaultFlags,&code);
 if(status!=errSecSuccess || !code)return NO;
 status=SecStaticCodeCheckValidity(code,kSecCSCheckNestedCode|kSecCSStrictValidate|kSecCSCheckAllArchitectures,NULL);
 CFRelease(code);return status==errSecSuccess;
}

@implementation SEPFixedApplicationOpener {
 NSString *_programSha256;
 NSString *_bootstrapSha256;
}
- (instancetype)initWithVerifiedConfiguration:(NSDictionary *)configuration {
 self=[super init];if(self){_programSha256=[configuration[@"programSha256"] copy];_bootstrapSha256=[configuration[@"bootstrapSha256"] copy];}return self;
}
- (void)openInstalledApplication:(NSURL *)url completion:(void(^)(BOOL))completion {
 if(!completion)return;
 struct passwd *account=getpwuid(geteuid());
 NSString *home=account && account->pw_dir?[NSString stringWithUTF8String:account->pw_dir]:nil;
 NSString *target=[home stringByAppendingPathComponent:@"Applications/DSH SEP.app"];
 struct stat original,current;
 if(!home || !SEPOpenerHash(_programSha256) || !SEPOpenerHash(_bootstrapSha256) || !url.isFileURL || ![url.path isEqualToString:target] || !SEPOpenerCanonical(target) || lstat(target.fileSystemRepresentation,&original)!=0 || !S_ISDIR(original.st_mode) || original.st_uid!=geteuid() || (original.st_mode&0022)!=0){completion(NO);return;}
 NSString *program=[target stringByAppendingPathComponent:@"Contents/Resources/PROGRAM.json"],*bootstrap=[target stringByAppendingPathComponent:@"Contents/Resources/BOOTSTRAP.json"];
 NSURL *fixedURL=[NSURL fileURLWithPath:target isDirectory:YES];
 // These are the hashes approved in the installer manifest, not a digest supplied by the UI.
 if(!SEPOpenerDocument(program,_programSha256) || !SEPOpenerDocument(bootstrap,_bootstrapSha256) || !SEPOpenerSigned(fixedURL) || !SEPOpenerCanonical(target) || lstat(target.fileSystemRepresentation,&current)!=0 || !SEPOpenerIdentity(original,current) || !SEPOpenerDocument(program,_programSha256) || !SEPOpenerDocument(bootstrap,_bootstrapSha256)){completion(NO);return;}
 NSWorkspaceOpenConfiguration *configuration=[NSWorkspaceOpenConfiguration configuration];configuration.activates=YES;
 [[NSWorkspace sharedWorkspace]openApplicationAtURL:fixedURL configuration:configuration completionHandler:^(NSRunningApplication *application,NSError *error){
  BOOL dispatched=application!=nil && error==nil;
  // A LaunchServices dispatch receipt is not a claim that the installed SEP is healthy.
  dispatch_async(dispatch_get_main_queue(),^{completion(dispatched);});
 }];
}
@end
