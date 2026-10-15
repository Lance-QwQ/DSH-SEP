// TEST OPERATOR ONLY. Identity checks follow package/application-observer.m
// sha256 bb37b6fae94465da6646609f48d444fc16957f884dfb265c0044b7fce1d99995.
// find <exact-real-app-path> <bundle-id>
// snapshot|quit <pid> <exact-real-app-path> <bundle-id> <birth-sec> <birth-usec>
// No screenshots, AX/TCC changes, name-based killing or force termination.
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <libproc.h>
#include <limits.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static int SEPObserveEmit(NSDictionary *row,int code){NSData *d=[NSJSONSerialization dataWithJSONObject:row options:0 error:nil];if(!d||d.length>4096)return 78;fwrite(d.bytes,1,d.length,stdout);fputc('\n',stdout);return code;}
static int SEPObserveBlocked(NSString *code){return SEPObserveEmit(@{@"status":@"blocked",@"code":code},78);}
static BOOL SEPObserveInteger(const char *text,unsigned long long maximum,unsigned long long *value){
 if(!text||!*text)return NO;for(const char*p=text;*p;p++)if(*p<'0'||*p>'9')return NO;
 errno=0;char *end=NULL;unsigned long long number=strtoull(text,&end,10);if(errno||!end||*end||number>maximum)return NO;*value=number;return YES;
}
static BOOL SEPObserveBirth(pid_t pid,struct proc_bsdinfo *info){
 return proc_pidinfo(pid,PROC_PIDTBSDINFO,0,info,sizeof(*info))==(int)sizeof(*info)&&info->pbi_pid==(uint32_t)pid&&info->pbi_uid==geteuid()&&info->pbi_start_tvsec>0&&info->pbi_start_tvusec<1000000;
}
static BOOL SEPObserveSameBirth(struct proc_bsdinfo a,struct proc_bsdinfo b){return a.pbi_pid==b.pbi_pid&&a.pbi_uid==b.pbi_uid&&a.pbi_start_tvsec==b.pbi_start_tvsec&&a.pbi_start_tvusec==b.pbi_start_tvusec;}
static NSString *SEPObserveRealPath(NSString *path){char resolved[PATH_MAX];return path.fileSystemRepresentation&&realpath(path.fileSystemRepresentation,resolved)?[NSString stringWithUTF8String:resolved]:nil;}
static BOOL SEPObserveIdentity(NSRunningApplication *app,NSString *path,NSString *identifier,struct proc_bsdinfo *birth){
 struct proc_bsdinfo after={0};return app&&app.processIdentifier>1&&SEPObserveBirth(app.processIdentifier,birth)&&[SEPObserveRealPath(app.bundleURL.path)isEqual:path]&&[app.bundleIdentifier isEqual:identifier]&&SEPObserveBirth(app.processIdentifier,&after)&&SEPObserveSameBirth(*birth,after);
}
static NSDictionary *SEPObserveWindows(pid_t pid){
 CFArrayRef list=CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID);if(!list)return nil;
 NSArray *rows=CFBridgingRelease(list);NSUInteger visible=0,titles=0,exact=0;
 for(id item in rows){if(![item isKindOfClass:NSDictionary.class])continue;NSDictionary *row=item;
  if([row[(__bridge NSString*)kCGWindowOwnerPID]intValue]!=pid||[row[(__bridge NSString*)kCGWindowLayer]intValue]!=0||![row[(__bridge NSString*)kCGWindowIsOnscreen]boolValue])continue;
  NSDictionary *bounds=row[(__bridge NSString*)kCGWindowBounds];CGRect rect=CGRectZero;if(![bounds isKindOfClass:NSDictionary.class]||!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds,&rect)||rect.size.width<=0||rect.size.height<=0)continue;
  NSNumber *alpha=row[(__bridge NSString*)kCGWindowAlpha];if(alpha&&alpha.doubleValue<=0)continue;visible++;
  id name=row[(__bridge NSString*)kCGWindowName];if([name isKindOfClass:NSString.class]&&[name length]){titles++;if([name isEqual:@"Install DSH SEP"])exact++;}
 }
 return @{@"visibleWindowCount":@(visible),@"titleMetadataAvailable":titles>0?@YES:@NO,@"exactInstallerTitleCount":@(exact),@"pixelsRead":@NO};
}
int main(int argc,const char **argv){@autoreleasepool{
 if(argc<2)return 64;NSString *action=[NSString stringWithUTF8String:argv[1]];BOOL find=[action isEqual:@"find"];
 if((find&&argc!=4)||(!find&&(argc!=7||![@[@"snapshot",@"quit"]containsObject:action])))return 64;
 NSString *path=[NSString stringWithUTF8String:argv[find?2:3]],*identifier=[NSString stringWithUTF8String:argv[find?3:4]];
 NSRange match=[identifier rangeOfString:@"^[A-Za-z0-9][A-Za-z0-9.-]{1,254}$" options:NSRegularExpressionSearch];
 if(!path.isAbsolutePath||![path hasSuffix:@".app"]||![SEPObserveRealPath(path)isEqual:path]||identifier.length<2||match.location!=0||match.length!=identifier.length)return 64;
 [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
 NSRunningApplication *app=nil;struct proc_bsdinfo birth={0};unsigned long long requestedPid=0,seconds=0,microseconds=0;
 if(find){
  NSMutableArray *matches=[NSMutableArray new];for(NSRunningApplication *candidate in [NSRunningApplication runningApplicationsWithBundleIdentifier:identifier])if([SEPObserveRealPath(candidate.bundleURL.path)isEqual:path])[matches addObject:candidate];
  if(matches.count==0)return SEPObserveEmit(@{@"status":@"absent",@"action":action},0);
  if(matches.count!=1)return SEPObserveBlocked(@"SEP_INSTALLER_OBSERVER_AMBIGUOUS");app=matches[0];
 }else{
  if(!SEPObserveInteger(argv[2],INT_MAX,&requestedPid)||requestedPid<2||!SEPObserveInteger(argv[5],ULLONG_MAX,&seconds)||seconds==0||!SEPObserveInteger(argv[6],999999,&microseconds))return 64;
  app=[NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)requestedPid];if(!app)return SEPObserveEmit(@{@"status":@"absent",@"action":action,@"pid":@(requestedPid)},0);
 }
 if(!SEPObserveIdentity(app,path,identifier,&birth))return SEPObserveBlocked(@"SEP_INSTALLER_OBSERVER_IDENTITY");
 if(!find&&(birth.pbi_start_tvsec!=seconds||birth.pbi_start_tvusec!=microseconds))return SEPObserveBlocked(@"SEP_INSTALLER_OBSERVER_BIRTH");
 NSDictionary *windows=SEPObserveWindows(app.processIdentifier);if(!windows)return SEPObserveBlocked(@"SEP_INSTALLER_OBSERVATION_UNAVAILABLE");
 struct proc_bsdinfo current={0};if(!SEPObserveIdentity(app,path,identifier,&current)||!SEPObserveSameBirth(birth,current))return SEPObserveBlocked(@"SEP_INSTALLER_OBSERVER_BIRTH");
 BOOL requested=NO;if([action isEqual:@"quit"])requested=[app terminate];
 NSMutableDictionary *receipt=[@{@"status":@"pass",@"action":action,@"pid":@(app.processIdentifier),@"bundleIdentifier":identifier,@"bundlePath":path,@"birthSource":@"proc_bsdinfo",@"birthSeconds":@(current.pbi_start_tvsec),@"birthMicroseconds":@(current.pbi_start_tvusec),@"requestSent":requested?@YES:@NO,@"terminated":app.terminated?@YES:@NO,@"active":app.active?@YES:@NO,@"hidden":app.hidden?@YES:@NO,@"forceTermination":@NO}mutableCopy];[receipt addEntriesFromDictionary:windows];
 return SEPObserveEmit(receipt,[action isEqual:@"quit"]&&!requested?1:0);
}}
