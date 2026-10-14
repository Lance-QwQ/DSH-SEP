// TEST ENTRY ONLY: unchanged production modules and real fixed controller.
#import "../native/InstallerUI.h"
#import "../admission/installer-admission.h"
#import "../transport/InstallerPipeTransport.h"
#import "../application/InstallerApplication.h"
#import "../application/FixedApplicationOpener.h"
#include <sys/stat.h>
#include <pwd.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <signal.h>
#ifdef SEP_INSTALLER_APPLICATION_TESTING
#error Use the real production delegate, not its termination test seam.
#endif
#ifndef SEP_INSTALLER_MANIFEST_SHA256
#error Compile the actual verified resource manifest SHA.
#endif
static void Emit(NSDictionary *row){NSData *d=[NSJSONSerialization dataWithJSONObject:row options:0 error:nil];if(d.length&&d.length<16384){fwrite(d.bytes,1,d.length,stdout);fputc('\n',stdout);fflush(stdout);}}
static BOOL Absent(NSString *p){struct stat s;return lstat(p.fileSystemRepresentation,&s)!=0&&errno==ENOENT;}
static NSArray<NSView *> *Views(NSView *root){NSMutableArray *out=[NSMutableArray arrayWithObject:root];for(NSView *v in root.subviews)[out addObjectsFromArray:Views(v)];return out;}
static NSView *Find(NSView *root,NSString *identifier){NSView *out=nil;for(NSView *v in Views(root))if([v.identifier isEqual:identifier]){if(out)return nil;out=v;}return out;}
static NSButton *Button(NSWindow *w,NSString *identifier){NSView *v=Find(w.contentView,identifier);return w.visible&&[v isKindOfClass:NSButton.class]&&!v.isHiddenOrHasHiddenAncestor&&[(NSButton *)v isEnabled]?(NSButton *)v:nil;}
static NSString *Plan(NSWindow *w){NSView *v=Find(w.contentView,@"review-summary");if(![v isKindOfClass:NSTextField.class])return nil;NSString *s=[(NSTextField *)v stringValue];NSRegularExpression *r=[NSRegularExpression regularExpressionWithPattern:@"Plan SHA-256: ([a-f0-9]{64})" options:0 error:nil];NSArray<NSTextCheckingResult *> *m=[r matchesInString:s options:0 range:NSMakeRange(0,s.length)];return m.count==1?[s substringWithRange:[m[0]rangeAtIndex:1]]:nil;}
static NSButton *SheetButton(NSWindow *w,NSString *title,NSString *plan){
 NSWindow *s=w.attachedSheet;if(!s||!s.visible||s.sheetParent!=w)return nil;BOOL message=NO,binding=NO;NSButton *button=nil;
 for(NSView *v in Views(s.contentView)){if([v isKindOfClass:NSTextField.class]){NSString *t=[(NSTextField *)v stringValue];if([t isEqual:@"Install this reviewed DSH SEP package?"])message=YES;if([t containsString:[@"Plan SHA-256: " stringByAppendingString:plan]])binding=YES;}if([v isKindOfClass:NSButton.class]&&[[(NSButton *)v title]isEqual:title]&&!v.isHiddenOrHasHiddenAncestor&&[(NSButton *)v isEnabled]){if(button)return nil;button=(NSButton *)v;}}
 return message&&binding?button:nil;
}
@interface SEPIntegrationProbe:NSObject
@property(nonatomic,strong) SEPInstallerUI *ui;
@property(nonatomic,strong) SEPInstallerPipeTransport *transport;
@property(nonatomic,strong) NSMutableDictionary *report;
@property(nonatomic,copy) NSString *home,*reviewHash,*failure;
@property(nonatomic) NSUInteger stage;
@property(nonatomic) NSTimeInterval until;
@property(nonatomic) BOOL installingObserved;
- (void)advance:(NSUInteger)stage seconds:(NSTimeInterval)seconds;
- (void)block:(NSString *)code;
- (void)poll:(NSTimer *)timer;
- (void)terminating:(NSNotification *)notification;
@end
@implementation SEPIntegrationProbe
- (void)advance:(NSUInteger)stage seconds:(NSTimeInterval)seconds {self.stage=stage;self.until=NSProcessInfo.processInfo.systemUptime+seconds;Emit(@{@"event":@"stage",@"stage":@(stage),@"uiPhase":self.ui.phase});}
- (BOOL)fresh {return Absent([self.home stringByAppendingPathComponent:@"Applications/DSH SEP.app"])&&Absent([self.home stringByAppendingPathComponent:@"Library/Application Support/DSH SEP/alpha2-mac-finder-preview"])&&Absent([self.home stringByAppendingPathComponent:@"Library/Application Support/DSH SEP Installer"]);}
- (void)block:(NSString *)code {if(self.failure)return;self.failure=code;self.report[@"status"]=@"blocked";self.report[@"code"]=code;Emit(@{@"event":@"blocked",@"code":code,@"uiPhase":self.ui.phase,@"resourcesReleased":self.ui.resourcesReleased?@YES:@NO});[NSApp terminate:nil];}
- (void)poll:(NSTimer *)timer {
 (void)timer;if(self.failure){if(!self.ui.window.attachedSheet&&[@[@"preview",@"cancelled",@"committed",@"recovery-list"]containsObject:self.ui.phase])[NSApp terminate:nil];return;}
 if(NSProcessInfo.processInfo.systemUptime>self.until){[self block:@"SEP_INSTALLER_INTEGRATION_DEADLINE"];return;}if([self.ui.phase isEqual:@"blocked"]){[self block:@"SEP_INSTALLER_INTEGRATION_UI_BLOCKED"];return;}
 @try{switch(self.stage){
 case 0:{if(![self.ui.phase isEqual:@"preview"])return;NSButton *b=Button(self.ui.window,@"cancel-review");NSString *p=Plan(self.ui.window);if(!b||!p||![self fresh]){[self block:@"SEP_INSTALLER_INTEGRATION_INITIAL_REVIEW"];return;}self.report[@"cancelReview"]=[@{@"actualButtonIdentifier":@"cancel-review",@"beforePhase":@"preview",@"planHash":p}mutableCopy];[self advance:1 seconds:30];[b performClick:nil];break;}
 case 1:{if(![self.ui.phase isEqual:@"cancelled"])return;NSButton *b=Button(self.ui.window,@"refresh-preview");if(!b||![self fresh]){[self block:@"SEP_INSTALLER_INTEGRATION_CANCEL_CHANGED_ACCOUNT"];return;}[self.report[@"cancelReview"]addEntriesFromDictionary:@{@"afterPhase":@"cancelled",@"accountUnchanged":@YES,@"targetAbsent":@YES}];[self advance:2 seconds:180];[b performClick:nil];break;}
 case 2:{if(![self.ui.phase isEqual:@"preview"])return;NSButton *b=Button(self.ui.window,@"install");self.reviewHash=Plan(self.ui.window);if(!b||!self.reviewHash){[self block:@"SEP_INSTALLER_INTEGRATION_REVIEW"];return;}[self advance:3 seconds:15];[b performClick:nil];break;}
 case 3:{if(!self.ui.window.attachedSheet)return;NSButton *b=SheetButton(self.ui.window,@"Cancel",self.reviewHash);if(!b){[self block:@"SEP_INSTALLER_INTEGRATION_CANCEL_SHEET"];return;}self.report[@"cancelSheet"]=[@{@"attachedToInstaller":@YES,@"actualButtonTitle":@"Cancel",@"directEndSheetUsed":@NO,@"beforePlanHash":self.reviewHash}mutableCopy];[self advance:4 seconds:15];[b performClick:nil];break;}
 case 4:{if(self.ui.window.attachedSheet||![self.ui.phase isEqual:@"preview"])return;NSString *p=Plan(self.ui.window);NSButton *b=Button(self.ui.window,@"install");if(!b||![p isEqual:self.reviewHash]||![self fresh]){[self block:@"SEP_INSTALLER_INTEGRATION_SHEET_CANCEL_CHANGED"];return;}[self.report[@"cancelSheet"]addEntriesFromDictionary:@{@"afterPlanHash":p,@"afterPhase":@"preview",@"targetAbsent":@YES}];[self advance:5 seconds:15];[b performClick:nil];break;}
 case 5:{if(!self.ui.window.attachedSheet)return;NSButton *b=SheetButton(self.ui.window,@"Install",self.reviewHash);if(!b){[self block:@"SEP_INSTALLER_INTEGRATION_INSTALL_SHEET"];return;}self.report[@"confirmSheet"]=[@{@"attachedToInstaller":@YES,@"actualButtonTitle":@"Install",@"directEndSheetUsed":@NO,@"planHash":self.reviewHash}mutableCopy];[self advance:6 seconds:1200];[b performClick:nil];break;}
 case 6:{if([self.ui.phase isEqual:@"installing"]){self.installingObserved=YES;return;}if(![self.ui.phase isEqual:@"committed"])return;if(!self.installingObserved||!Absent([self.home stringByAppendingPathComponent:@"Library/Application Support/DSH SEP/alpha2-mac-finder-preview"])){[self block:@"SEP_INSTALLER_INTEGRATION_COMMIT"];return;}[self.report[@"confirmSheet"]addEntriesFromDictionary:@{@"phase":@"committed",@"installingObserved":@YES}];[self advance:7 seconds:30];[self.ui.window performClose:nil];break;}
 case 7:break;default:[self block:@"SEP_INSTALLER_INTEGRATION_STAGE"];break;
 }}@catch(NSException *e){(void)e;[self block:@"SEP_INSTALLER_INTEGRATION_EXCEPTION"];}
}
- (void)terminating:(NSNotification *)notification {
 (void)notification;NSDictionary *s=self.transport.snapshot;BOOL receipt=[s[@"phase"]isEqual:@"closed-receipt"];BOOL released=self.ui.resourcesReleased&&[self.ui.phase isEqual:@"closed"]&&receipt&&[s[@"stdoutEOF"]boolValue]&&[s[@"processExited"]boolValue]&&[s[@"terminationDelivered"]boolValue]&&[s[@"exitCode"]integerValue]==0&&![s[@"signalled"]boolValue];
 self.report[@"status"]=!self.failure&&self.stage==7&&released?@"pass":@"blocked";self.report[@"close"]=@{@"uiResourcesReleased":self.ui.resourcesReleased?@YES:@NO,@"controllerClosedReceipt":receipt?@YES:@NO,@"controllerOutputEOF":[s[@"stdoutEOF"]boolValue]?@YES:@NO,@"controllerExited":[s[@"processExited"]boolValue]?@YES:@NO,@"controllerExitCode":s[@"exitCode"]?:@(-1),@"controllerSignalled":[s[@"signalled"]boolValue]?@YES:@NO,@"forcedTermination":@NO,@"cleanupUnconfirmed":released?@NO:@YES,@"path":self.failure?@"subsequent normal cleanup after failed scenario":@"normal scenario close"};Emit(@{@"event":@"final",@"report":self.report});
}
@end
int main(int argc,const char **argv){@autoreleasepool{
 (void)argv;signal(SIGPIPE,SIG_IGN);[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];NSString *failure=nil;NSDictionary *configuration=SEPInstallerVerifyMainBundle(argc,&failure);if(!configuration){Emit(@{@"event":@"preowned-failure",@"code":failure?:@"SEP_INSTALLER_INTEGRATION_ADMISSION"});return 78;}
 SEPInstallerPipeTransport *transport=nil;@try{transport=[[SEPInstallerPipeTransport alloc]initWithVerifiedConfiguration:configuration manifestSHA:@SEP_INSTALLER_MANIFEST_SHA256];}@catch(NSException *e){(void)e;Emit(@{@"event":@"blocked",@"code":@"SEP_INSTALLER_INTEGRATION_OWNER_UNKNOWN"});while(YES)[NSApp run];}
 id started=transport.snapshot[@"started"];if(![started isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)started)!=CFBooleanGetTypeID()){Emit(@{@"event":@"blocked",@"code":@"SEP_INSTALLER_INTEGRATION_OWNER_UNKNOWN"});while(YES)[NSApp run];}if(![started boolValue]){Emit(@{@"event":@"preowned-failure",@"code":@"SEP_INSTALLER_INTEGRATION_TRANSPORT"});return 78;}
 SEPFixedApplicationOpener *opener=[[SEPFixedApplicationOpener alloc]initWithVerifiedConfiguration:configuration];SEPInstallerUI *ui=[[SEPInstallerUI alloc]initWithTransport:transport opener:opener];__attribute__((objc_precise_lifetime)) SEPInstallerApplication *application=[[SEPInstallerApplication alloc]initWithUI:ui];NSApp.delegate=application;[application installMenu];
 __attribute__((objc_precise_lifetime)) SEPIntegrationProbe *probe=[SEPIntegrationProbe new];probe.ui=ui;probe.transport=transport;struct passwd *account=getpwuid(geteuid());probe.home=account&&account->pw_dir?[NSString stringWithUTF8String:account->pw_dir]:nil;
 probe.report=[@{@"schema":@1,@"status":@"pending",@"testEntry":@YES,@"productionMainByteIdentical":@NO,@"realController":@YES,@"mockTransport":@NO,@"mockReply":@NO,@"nativeAdmissionVerified":@YES,@"manifestSha256":@SEP_INSTALLER_MANIFEST_SHA256}mutableCopy];[NSNotificationCenter.defaultCenter addObserver:probe selector:@selector(terminating:) name:NSApplicationWillTerminateNotification object:NSApp];
 [ui present];[NSApp activateIgnoringOtherApps:YES];[probe advance:0 seconds:180];NSTimer *timer=[NSTimer timerWithTimeInterval:0.05 target:probe selector:@selector(poll:) userInfo:nil repeats:YES];for(NSString *mode in @[NSRunLoopCommonModes,NSModalPanelRunLoopMode])[NSRunLoop.mainRunLoop addTimer:timer forMode:mode];if(!probe.home)[probe block:@"SEP_INSTALLER_INTEGRATION_ACCOUNT"];[NSApp run];while(!ui.resourcesReleased)[NSApp run];return 0;
}}
