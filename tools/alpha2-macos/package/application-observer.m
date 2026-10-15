#import <AppKit/AppKit.h>
#include <libproc.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
// Test operator only. No force termination, name matching or descendant killing.
// Commands: snapshot|hide|quit <pid> <exact-real-bundle-path> <bundle-id|-> [expected-launch-time]
// launchTime is the kernel process birth, not nullable NSRunningApplication.launchDate.
static BOOL kernelBirth(pid_t pid,struct proc_bsdinfo *info){
 int count=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,info,sizeof(*info));
 return count==(int)sizeof(*info)&&info->pbi_pid==(uint32_t)pid&&info->pbi_uid==geteuid()&&info->pbi_start_tvsec>0&&info->pbi_start_tvusec<1000000;
}
static int blockedBirth(void){puts("{\"status\":\"blocked\",\"code\":\"SEP_APPLICATION_BIRTH\"}");return 78;}
int main(int argc,const char **argv){@autoreleasepool{
 if(argc!=5&&argc!=6)return 64;NSString *action=@(argv[1]),*path=@(argv[3]),*identifier=@(argv[4]);
 if(![@[@"snapshot",@"hide",@"quit"] containsObject:action])return 64;
 char *end=NULL;long value=strtol(argv[2],&end,10);if(!end||*end||value<2||value>INT_MAX)return 64;
 NSString *canonical=path.stringByResolvingSymlinksInPath;if(![canonical isEqual:path]||![path hasPrefix:@"/"]||![path hasSuffix:@".app"])return 64;
 NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)value];
 if(!app){puts("{\"status\":\"absent\"}");return 0;}
 struct proc_bsdinfo before={0},current={0};if(!kernelBirth((pid_t)value,&before))return blockedBirth();
 NSString *actual=app.bundleURL.path.stringByResolvingSymlinksInPath;
 if(![actual isEqual:path]||(![identifier isEqual:@"-"]&&![app.bundleIdentifier isEqual:identifier])){puts("{\"status\":\"blocked\",\"code\":\"SEP_APPLICATION_IDENTITY\"}");return 78;}
 if(!kernelBirth((pid_t)value,&current)||before.pbi_start_tvsec!=current.pbi_start_tvsec||before.pbi_start_tvusec!=current.pbi_start_tvusec)return blockedBirth();
 double birth=(double)current.pbi_start_tvsec+(double)current.pbi_start_tvusec/1000000.0;
 if(![action isEqual:@"snapshot"]){char *last=NULL;double expected=argc==6?strtod(argv[5],&last):0;if(!last||*last||!isfinite(expected)||expected<=0||birth!=expected)return blockedBirth();}
 BOOL sent=YES;if([action isEqual:@"hide"])sent=[app hide];else if([action isEqual:@"quit"])sent=[app terminate];
 NSDictionary *receipt=@{@"status":@"pass",@"action":action,@"requestSent":@(sent),@"pid":@(app.processIdentifier),@"bundleIdentifier":app.bundleIdentifier?:@"",@"launchTime":@(birth),@"birthSource":@"proc_bsdinfo",@"birthSeconds":@(current.pbi_start_tvsec),@"birthMicroseconds":@(current.pbi_start_tvusec),@"applicationLaunchDate":app.launchDate?@(app.launchDate.timeIntervalSince1970):NSNull.null,@"active":@(app.active),@"hidden":@(app.hidden),@"terminated":@(app.terminated)};
 NSData *json=[NSJSONSerialization dataWithJSONObject:receipt options:0 error:NULL];fwrite(json.bytes,1,json.length,stdout);fputc('\n',stdout);return sent?0:1;
}}
