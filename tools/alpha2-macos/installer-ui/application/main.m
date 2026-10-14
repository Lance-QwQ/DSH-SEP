// Production composition draft. Integration/installer-app acceptance pending.
// Compile only with the final fixed INSTALLER.json SHA, never the test seam.
#import "InstallerApplication.h"
#import "FixedApplicationOpener.h"
#import "../admission/installer-admission.h"
#import "../transport/InstallerPipeTransport.h"
#ifdef SEP_INSTALLER_APPLICATION_TESTING
#error The installer product must not contain the application termination test seam.
#endif
#ifndef SEP_INSTALLER_MANIFEST_SHA256
#error The installer product requires its compiled manifest SHA-256.
#endif

static NSString *SEPInstallerPublicCode(id value){if(![value isKindOfClass:NSString.class])return @"SEP_INSTALLER_STARTUP_BLOCKED";NSRange match=[value rangeOfString:@"^SEP_[A-Z0-9_]{1,90}$" options:NSRegularExpressionSearch];return match.location==0&&match.length==[value length]?value:@"SEP_INSTALLER_STARTUP_BLOCKED";}
static int SEPInstallerRefuseBeforeOwner(NSString *code){NSAlert *alert=[NSAlert new];alert.messageText=@"DSH SEP Installer could not start";alert.informativeText=SEPInstallerPublicCode(code);[alert addButtonWithTitle:@"Close"];[alert runModal];return 1;}

// Used only when startup cannot positively establish that no owner exists.
// No termination callback is invented, and no application-layer kill exists.
@interface SEPInstallerUnknownOwner : NSObject <SEPInstallerPrivateTransport>
@end
@implementation SEPInstallerUnknownOwner
- (void)requestOperation:(NSString *)operation input:(NSDictionary *)input completion:(void (^)(NSDictionary *))completion {(void)operation;(void)input;completion(@{@"status":@"blocked",@"phase":@"blocked",@"code":@"SEP_INSTALLER_OWNER_UNCONFIRMED"});}
- (void)observeTermination:(void (^)(NSInteger,BOOL))observer {(void)observer;}
@end

int main(int argc,const char **argv){@autoreleasepool{
 (void)argv;[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
 NSString *failure=nil;NSDictionary *configuration=nil;
 @try{configuration=SEPInstallerVerifyMainBundle(argc,&failure);}@catch(NSException *error){(void)error;failure=@"SEP_INSTALLER_ADMISSION_UNCONFIRMED";}
 if(!configuration)return SEPInstallerRefuseBeforeOwner(failure);
 __attribute__((objc_precise_lifetime)) SEPInstallerPipeTransport *transport=nil;NSDictionary *snapshot=nil;
 @try{transport=[[SEPInstallerPipeTransport alloc]initWithVerifiedConfiguration:configuration manifestSHA:@SEP_INSTALLER_MANIFEST_SHA256];snapshot=transport.snapshot;}@catch(NSException *error){(void)error;}
 id started=snapshot[@"started"];BOOL definiteBoolean=[started isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)started)==CFBooleanGetTypeID();
 if(definiteBoolean&&![started boolValue])return SEPInstallerRefuseBeforeOwner(snapshot[@"code"]);
 id<SEPInstallerPrivateTransport> owner=definiteBoolean&&[started boolValue]?transport:[SEPInstallerUnknownOwner new];
 SEPFixedApplicationOpener *opener=[[SEPFixedApplicationOpener alloc]initWithVerifiedConfiguration:configuration];
 SEPInstallerUI *ui=[[SEPInstallerUI alloc]initWithTransport:owner opener:opener];__attribute__((objc_precise_lifetime)) SEPInstallerApplication *application=[[SEPInstallerApplication alloc]initWithUI:ui];
 NSApp.delegate=application;[application installMenu];[ui present];[NSApp activateIgnoringOtherApps:YES];[NSApp run];
 // Normally terminate: exits AppKit directly. A stopped run loop alone is not
 // resource confirmation; keep the same process and original UI owner alive.
 while(!ui.resourcesReleased){[ui.window orderFrontRegardless];[NSApp run];}
 (void)transport;return 0;
}}
