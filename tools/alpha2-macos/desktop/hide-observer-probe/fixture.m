#import <AppKit/AppKit.h>
#include <libproc.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
// Test-only single process, no descendants, network, credentials or product IO.
@interface ProbeDelegate : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@property(strong) NSTimer *timer;
@property(strong) NSDate *deadline;
@property(strong) NSMutableData *input;
@property BOOL ready;
@property BOOL didHide;
@end
@implementation ProbeDelegate
- (void)emit:(NSString *)event {
 struct proc_bsdinfo b={0};int n=proc_pidinfo(getpid(),PROC_PIDTBSDINFO,0,&b,sizeof(b));
 NSRunningApplication *a=NSRunningApplication.currentApplication;
 NSDictionary *v=@{@"event":event,@"pid":@(getpid()),@"bundlePath":NSBundle.mainBundle.bundlePath.stringByResolvingSymlinksInPath,@"bundleIdentifier":NSBundle.mainBundle.bundleIdentifier?:@"",@"birthValid":@(n==sizeof(b)&&b.pbi_pid==getpid()&&b.pbi_uid==geteuid()),@"birthSeconds":@(b.pbi_start_tvsec),@"birthMicroseconds":@(b.pbi_start_tvusec),@"activationPolicy":@(NSApp.activationPolicy),@"runningActivationPolicy":@(a.activationPolicy),@"finishedLaunching":@(a.finishedLaunching),@"active":@(NSApp.active),@"hidden":@(NSApp.hidden),@"visible":@(self.window.visible),@"windowCanHide":@(self.window.canHide),@"didHide":@(self.didHide),@"presentationOptions":@(NSApp.presentationOptions),@"systemPresentationOptions":@(NSApp.currentSystemPresentationOptions)};
 NSData *d=[NSJSONSerialization dataWithJSONObject:v options:0 error:NULL];fwrite(d.bytes,1,d.length,stdout);fputc('\n',stdout);fflush(stdout);
}
- (void)applicationDidFinishLaunching:(NSNotification *)note {
 self.input=NSMutableData.data;self.deadline=[NSDate dateWithTimeIntervalSinceNow:35];
 self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(180,180,420,180) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
 self.window.title=@"SEP independent hide fixture";self.window.releasedWhenClosed=NO;
 [self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
 fcntl(STDIN_FILENO,F_SETFL,fcntl(STDIN_FILENO,F_GETFL)|O_NONBLOCK);
 self.timer=[NSTimer scheduledTimerWithTimeInterval:0.05 target:self selector:@selector(tick:) userInfo:nil repeats:YES];
}
- (void)tick:(NSTimer *)timer {
 if(!self.ready&&self.window.visible&&NSApp.active&&!NSApp.hidden&&NSRunningApplication.currentApplication.finishedLaunching){self.ready=YES;[self emit:@"ready"];}
 char bytes[128];ssize_t n=read(STDIN_FILENO,bytes,sizeof(bytes));
 if(n>0)[self.input appendBytes:bytes length:(NSUInteger)n];
 if(self.input.length>1024){[self emit:@"invalidInput"];[NSApp terminate:nil];return;}
 while(self.input.length){const unsigned char *p=self.input.bytes;NSUInteger i=0;while(i<self.input.length&&p[i]!='\n')i++;if(i==self.input.length)break;
  NSData *line=[self.input subdataWithRange:NSMakeRange(0,i)];[self.input replaceBytesInRange:NSMakeRange(0,i+1) withBytes:NULL length:0];NSString *command=[[NSString alloc]initWithData:line encoding:NSUTF8StringEncoding];
  if([command isEqual:@"snapshot"])[self emit:@"snapshot"];
  else if([command isEqual:@"quit"]){[self emit:@"quitRequested"];[NSApp terminate:nil];return;}
  else{[self emit:@"invalidInput"];[NSApp terminate:nil];return;}
 }
 if(n==0){[self emit:@"inputEOF"];[NSApp terminate:nil];return;}
 if(self.deadline.timeIntervalSinceNow<=0){[self emit:@"fixtureDeadline"];[NSApp terminate:nil];}
}
- (void)applicationDidHide:(NSNotification *)note {self.didHide=YES;[self emit:@"didHide"];}
- (void)applicationWillTerminate:(NSNotification *)note {[self.timer invalidate];[self emit:@"willTerminate"];}
@end
int main(void){@autoreleasepool{
 [NSApplication sharedApplication];if(![NSApp setActivationPolicy:NSApplicationActivationPolicyRegular])return 78;
 ProbeDelegate *delegate=ProbeDelegate.new;NSApp.delegate=delegate;[NSApp run];return 0;
}}
