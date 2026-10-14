#import <AppKit/AppKit.h>
// Test operator only. No force termination, name matching or descendant killing.
// Commands: snapshot|hide|quit <pid> <exact-real-bundle-path> <bundle-id|-> [expected-launch-time]
int main(int argc,const char **argv){@autoreleasepool{
 if(argc!=5&&argc!=6)return 64;NSString *action=@(argv[1]),*path=@(argv[3]),*identifier=@(argv[4]);
 if(![@[@"snapshot",@"hide",@"quit"] containsObject:action])return 64;
 char *end=NULL;long value=strtol(argv[2],&end,10);if(!end||*end||value<2||value>INT_MAX)return 64;
 NSString *canonical=path.stringByResolvingSymlinksInPath;if(![canonical isEqual:path]||![path hasPrefix:@"/"]||![path hasSuffix:@".app"])return 64;
 NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)value];
 if(!app){puts("{\"status\":\"absent\"}");return 0;}
 NSString *actual=app.bundleURL.path.stringByResolvingSymlinksInPath;
 if(![actual isEqual:path]||(![identifier isEqual:@"-"]&&![app.bundleIdentifier isEqual:identifier])){puts("{\"status\":\"blocked\",\"code\":\"SEP_APPLICATION_IDENTITY\"}");return 78;}
 if(![action isEqual:@"snapshot"]){char *last=NULL;double expected=argc==6?strtod(argv[5],&last):0;if(!last||*last||expected<=0||!app.launchDate||app.launchDate.timeIntervalSince1970!=expected){puts("{\"status\":\"blocked\",\"code\":\"SEP_APPLICATION_BIRTH\"}");return 78;}}
 BOOL sent=YES;if([action isEqual:@"hide"])sent=[app hide];else if([action isEqual:@"quit"])sent=[app terminate];
 NSDictionary *receipt=@{@"status":@"pass",@"action":action,@"requestSent":@(sent),@"pid":@(app.processIdentifier),@"bundleIdentifier":app.bundleIdentifier?:@"",@"launchTime":@(app.launchDate.timeIntervalSince1970),@"active":@(app.active),@"hidden":@(app.hidden),@"terminated":@(app.terminated)};
 NSData *json=[NSJSONSerialization dataWithJSONObject:receipt options:0 error:NULL];fwrite(json.bytes,1,json.length,stdout);fputc('\n',stdout);return sent?0:1;
}}
