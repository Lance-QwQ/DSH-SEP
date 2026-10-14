#import "InstallerApplication.h"
@interface SEPInstallerApplication ()
@property(nonatomic,strong) SEPInstallerUI *ui;
@property(nonatomic,strong) id closeObserver;
@property(nonatomic,copy) void (^terminationRequest)(void);
@property(nonatomic) BOOL finalTerminationRequested;
@end
@implementation SEPInstallerApplication
- (instancetype)initWithUI:(SEPInstallerUI *)ui {
 if(!(self=[super init]))return nil;_ui=ui;_terminationRequest=^{[NSApp terminate:nil];};
 __weak typeof(self) weak=self;
 _closeObserver=[NSNotificationCenter.defaultCenter addObserverForName:NSWindowWillCloseNotification object:ui.window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note){typeof(self) strong=weak;if(!strong||note.object!=strong.ui.window||!strong.ui.resourcesReleased||strong.finalTerminationRequested)return;strong.finalTerminationRequested=YES;strong.terminationRequest();}];
 return self;
}
#ifdef SEP_INSTALLER_APPLICATION_TESTING
- (instancetype)initWithUI:(SEPInstallerUI *)ui terminationRequest:(void (^)(void))terminationRequest {if((self=[self initWithUI:ui]))_terminationRequest=[terminationRequest copy];return self;}
#endif
- (void)dealloc {if(_closeObserver)[NSNotificationCenter.defaultCenter removeObserver:_closeObserver];}
- (void)installMenu {
 NSMenu *bar=[NSMenu new];NSMenuItem *root=[NSMenuItem new];NSMenu *application=[[NSMenu alloc]initWithTitle:@"DSH SEP Installer"];
 NSMenuItem *quit=[[NSMenuItem alloc]initWithTitle:@"Quit DSH SEP Installer" action:@selector(requestQuit:) keyEquivalent:@"q"];quit.target=self;[application addItem:quit];root.submenu=application;[bar addItem:root];NSApp.mainMenu=bar;
}
- (void)requestQuit:(id)sender {(void)sender;if(_ui.resourcesReleased){if(!_finalTerminationRequested){_finalTerminationRequested=YES;_terminationRequest();}return;}[_ui.window performClose:nil];}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {(void)sender;if(_ui.resourcesReleased)return NSTerminateNow;[_ui.window performClose:nil];return NSTerminateCancel;}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {(void)sender;return NO;}
@end
