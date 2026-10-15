#import "installer-admission.h"
#include <stdio.h>
#include <unistd.h>
#include <signal.h>
#include <poll.h>

#ifdef SEP_INSTALLER_ADMISSION_TEST_HOOK
/* Test-only, fixed read boundary and owned fd 3. No path/env configuration.
 * The production compilation does not include this function or call site. */
BOOL SEPInstallerAdmissionTestCheckpoint(NSString *stage, NSString *relative) {
  static BOOL used=NO;
  if(used || ![stage isEqual:@"after-file-read"] || ![relative isEqual:@"Resources/runtime/support/closure.mjs"])return YES;
  used=YES;
  const char marker[]="read-boundary\n";
  if(write(3,marker,sizeof(marker)-1)!=(ssize_t)(sizeof(marker)-1))return NO;
  struct pollfd item={.fd=3,.events=POLLIN,.revents=0};
  if(poll(&item,1,5000)!=1 || !(item.revents&POLLIN))return NO;
  char byte=0;return read(3,&byte,1)==1 && byte=='A';
}
#endif

int main(int argc,char **argv) {
  (void)argv;signal(SIGPIPE,SIG_IGN);
  @autoreleasepool {
    NSString *failure=nil;NSDictionary *config=SEPInstallerVerifyMainBundle(argc,&failure);
    NSDictionary *receipt;
#ifdef SEP_INSTALLER_ADMISSION_REPORT
    receipt=config?@{@"status":@"pass",@"manifestVerified":@YES,@"config":config}:@{@"status":@"blocked",@"code":failure?:@"SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY"};
#else
    receipt=@{@"status":@"blocked",@"manifestVerified":(config?@YES:@NO),@"code":config?@"SEP_INSTALLER_UI_NOT_CONNECTED":failure?:@"SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY"};
#endif
    NSData *data=[NSJSONSerialization dataWithJSONObject:receipt options:0 error:NULL];
    if(!data)return 71;fwrite(data.bytes,1,data.length,stdout);fputc('\n',stdout);
#ifdef SEP_INSTALLER_ADMISSION_REPORT
    return config?0:78;
#else
    return 78;
#endif
  }
}
