#import "InstallerUI.h"

static BOOL SEPText(id value,NSUInteger limit){return [value isKindOfClass:NSString.class]&&[(NSString *)value length]>0&&[(NSString *)value length]<=limit;}
static BOOL SEPPattern(id value,NSString *pattern){if(!SEPText(value,2048))return NO;NSRange match=[(NSString *)value rangeOfString:pattern options:NSRegularExpressionSearch];return match.location==0&&match.length==[(NSString *)value length];}
static BOOL SEPPath(id value){return SEPText(value,2048)&&[(NSString *)value hasPrefix:@"/"]&&[(NSString *)value rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location==NSNotFound;}
static BOOL SEPBoolean(id value){return value&&CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID();}
static BOOL SEPNumber(id value,NSUInteger min,NSUInteger max){return [value isKindOfClass:NSNumber.class]&&!SEPBoolean(value)&&[value doubleValue]>=(double)min&&[value doubleValue]<=(double)max&&[value doubleValue]==(double)[value unsignedLongLongValue];}
static NSDictionary *SEPCopyReply(id value){if(![value isKindOfClass:NSDictionary.class]||![NSJSONSerialization isValidJSONObject:value])return nil;NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];if(!data||data.length>16384)return nil;return [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];}

@interface SEPInstallerUI () <NSTableViewDataSource,NSTableViewDelegate>
@property(nonatomic,strong) id<SEPInstallerPrivateTransport> transport;
@property(nonatomic,strong) id<SEPInstallerApplicationOpener> opener;
@property(nonatomic,readwrite,copy) NSString *phase;
@property(nonatomic,readwrite) BOOL resourcesReleased;
@property(nonatomic,strong) NSTextField *summary;
@property(nonatomic,strong) NSTextField *statusLabel;
@property(nonatomic,strong) NSTableView *recoveries;
@property(nonatomic,strong) NSArray<NSDictionary *> *rows;
@property(nonatomic,strong) NSMutableDictionary<NSString *,NSButton *> *buttons;
@property(nonatomic,copy) NSDictionary *review;
@property(nonatomic,copy) NSDictionary *acceptedReview;
@property(nonatomic,copy) NSString *acceptedTransaction;
@property(nonatomic,copy) NSString *installedPath;
@property(nonatomic,strong) NSAlert *alert;
@property(nonatomic) BOOL presented;
@property(nonatomic) BOOL busy;
@property(nonatomic) BOOL dialog;
@property(nonatomic) BOOL closingAdmission;
@property(nonatomic) BOOL closeReceipt;
@property(nonatomic) BOOL childExited;
@property(nonatomic) BOOL childExitOK;
@property(nonatomic) NSUInteger serial;
@property(nonatomic) NSUInteger pending;
@end

@implementation SEPInstallerUI
- (instancetype)initWithTransport:(id<SEPInstallerPrivateTransport>)transport opener:(id<SEPInstallerApplicationOpener>)opener {
 NSParameterAssert(transport);NSParameterAssert(opener);
 NSWindow *window=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,760,620) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable backing:NSBackingStoreBuffered defer:NO];
 if((self=[super initWithWindow:window])){
  _transport=transport;_opener=opener;_phase=@"initial";_rows=@[];_buttons=[NSMutableDictionary new];window.title=@"Install DSH SEP";window.delegate=self;window.releasedWhenClosed=NO;[window center];
  _summary=[NSTextField wrappingLabelWithString:@"Preparing a read-only installation review…"];_summary.frame=NSMakeRect(24,372,712,220);_summary.identifier=@"review-summary";_summary.selectable=YES;[window.contentView addSubview:_summary];
  _statusLabel=[NSTextField wrappingLabelWithString:@"No installation has started."];_statusLabel.frame=NSMakeRect(24,317,712,48);_statusLabel.identifier=@"status";[window.contentView addSubview:_statusLabel];
  [self button:@"Review install" identifier:@"refresh-preview" action:@selector(refreshPreview:) frame:NSMakeRect(24,275,140,30)];
  [self button:@"Install" identifier:@"install" action:@selector(install:) frame:NSMakeRect(174,275,110,30)];
  [self button:@"Cancel review" identifier:@"cancel-review" action:@selector(cancelReview:) frame:NSMakeRect(294,275,140,30)];
  [self button:@"Check recovery" identifier:@"list-recovery" action:@selector(listRecovery:) frame:NSMakeRect(444,275,145,30)];
  _recoveries=[[NSTableView alloc]initWithFrame:NSMakeRect(0,0,712,190)];_recoveries.identifier=@"recoveries";_recoveries.dataSource=self;_recoveries.delegate=self;_recoveries.allowsMultipleSelection=NO;
  NSTableColumn *column=[[NSTableColumn alloc]initWithIdentifier:@"summary"];column.title=@"Recorded installation transactions";column.width=690;[_recoveries addTableColumn:column];
  NSScrollView *scroll=[[NSScrollView alloc]initWithFrame:NSMakeRect(24,75,712,188)];scroll.hasVerticalScroller=YES;scroll.documentView=_recoveries;[window.contentView addSubview:scroll];
  [self button:@"Review recovery" identifier:@"resume" action:@selector(resume:) frame:NSMakeRect(24,24,160,32)];
  [self button:@"Open DSH SEP" identifier:@"open-installed" action:@selector(openInstalled:) frame:NSMakeRect(194,24,160,32)];
  [self updateControls];
 }
 return self;
}
- (void)button:(NSString *)title identifier:(NSString *)identifier action:(SEL)action frame:(NSRect)frame {NSButton *button=[NSButton buttonWithTitle:title target:self action:action];button.frame=frame;button.identifier=identifier;self.buttons[identifier]=button;[self.window.contentView addSubview:button];}
- (void)present {
 if(self.presented)return;self.presented=YES;[self showWindow:nil];[self.window orderFrontRegardless];
 __weak SEPInstallerUI *weak=self;[self.transport observeTermination:^(NSInteger code,BOOL signalled){dispatch_async(dispatch_get_main_queue(),^{SEPInstallerUI *ui=weak;if(!ui)return;ui.childExited=YES;ui.childExitOK=code==0&&!signalled;if(!ui.childExitOK||!ui.closingAdmission)[ui block:@"SEP_INSTALLER_CHILD_EXIT_UNCONFIRMED"];else [ui reconcileClose];});}];
 [self request:@"listRecovery" input:@{} initial:YES];
}
- (void)updateControls {
 BOOL idle=!self.busy&&!self.dialog&&!self.closingAdmission&&!self.childExited;
 for(NSButton *button in self.buttons.allValues)button.enabled=NO;
 self.buttons[@"refresh-preview"].enabled=idle&&![self.phase isEqual:@"committed"]&&![self.phase isEqual:@"blocked"];
 self.buttons[@"install"].enabled=idle&&self.review!=nil&&[self.phase isEqual:@"preview"];
 self.buttons[@"cancel-review"].enabled=self.buttons[@"install"].enabled;
 self.buttons[@"list-recovery"].enabled=idle&&![self.phase isEqual:@"blocked"];
 NSInteger selected=self.recoveries.selectedRow;BOOL resumable=selected>=0&&selected<(NSInteger)self.rows.count&&[@[@"planned",@"executing",@"committed"] containsObject:self.rows[selected][@"phase"]];
 self.buttons[@"resume"].enabled=idle&&resumable&&[self.phase isEqual:@"recovery-list"];
 self.buttons[@"open-installed"].enabled=idle&&self.installedPath!=nil&&[self.phase isEqual:@"committed"];
}
- (void)block:(NSString *)code {
 self.phase=@"blocked";self.busy=NO;self.review=nil;self.acceptedReview=nil;self.pending=0;
 self.statusLabel.stringValue=[NSString stringWithFormat:@"Blocked: %@. No cleanup or application-health claim can be made.",SEPPattern(code,@"^SEP_[A-Z0-9_]{1,90}$")?code:@"SEP_INSTALLER_UI_RESPONSE"];
 [self updateControls];
}
- (void)request:(NSString *)operation input:(NSDictionary *)input initial:(BOOL)initial {
 if(self.busy||self.childExited||self.resourcesReleased)return;
 self.busy=YES;NSUInteger ticket=++self.serial;self.pending=ticket;
 self.phase=[operation isEqual:@"close"]?@"closing":([operation isEqual:@"confirm"]||[operation isEqual:@"resume"]?@"installing":@"reading");[self updateControls];
 __weak SEPInstallerUI *weak=self;
 [self.transport requestOperation:operation input:input completion:^(NSDictionary *reply){NSDictionary *captured=SEPCopyReply(reply);dispatch_async(dispatch_get_main_queue(),^{SEPInstallerUI *ui=weak;if(!ui||ui.pending!=ticket||ui.resourcesReleased)return;ui.pending=0;ui.busy=NO;[ui receive:captured operation:operation initial:initial];});}];
}
- (BOOL)validReview:(NSDictionary *)value {
 return [value isKindOfClass:NSDictionary.class]&&SEPPattern(value[@"planHash"],@"^[a-f0-9]{64}$")&&SEPPattern(value[@"transactionId"],@"^[a-f0-9]{32}$")&&SEPPath(value[@"target"])&&SEPPath(value[@"dataRoot"])&&SEPNumber(value[@"entries"],1,100000)&&SEPNumber(value[@"totalBytes"],0,8589934592ULL)&&SEPBoolean(value[@"createApplications"]);
}
- (BOOL)validRows:(NSArray *)rows {
 if(![rows isKindOfClass:NSArray.class]||rows.count>64)return NO;NSMutableSet *seen=[NSMutableSet new];
 for(id row in rows){if(![row isKindOfClass:NSDictionary.class]||!SEPPattern(row[@"transactionId"],@"^[a-f0-9]{32}$")||[seen containsObject:row[@"transactionId"]])return NO;[seen addObject:row[@"transactionId"]];if([row[@"phase"] isEqual:@"blocked"]){if(!SEPPattern(row[@"code"],@"^SEP_[A-Z0-9_]{1,90}$"))return NO;}else if(![@[@"confirmed",@"planned",@"executing",@"committed"] containsObject:row[@"phase"]])return NO;}
 return YES;
}
- (void)receive:(NSDictionary *)reply operation:(NSString *)operation initial:(BOOL)initial {
 if(!reply||![reply[@"status"] isEqual:@"pass"]){[self block:reply[@"code"]?:@"SEP_INSTALLER_UI_RESPONSE"];return;}
 NSString *phase=reply[@"phase"];
 if([operation isEqual:@"listRecovery"]&&[phase isEqual:@"recovery-list"]&&[self validRows:reply[@"recoveries"]]){
  self.rows=reply[@"recoveries"];self.review=nil;self.phase=@"recovery-list";[self.recoveries reloadData];self.statusLabel.stringValue=self.rows.count?@"Select a verified transaction to review recovery. Blocked records remain blocked.":@"No recovery records found.";[self updateControls];
  if(initial&&self.rows.count==0)[self request:@"preview" input:@{} initial:NO];return;
 }
 if([operation isEqual:@"preview"]&&[phase isEqual:@"preview"]&&[self validReview:reply[@"preview"]]){
  self.review=reply[@"preview"];self.phase=@"preview";NSDictionary *p=self.review;
  self.summary.stringValue=[NSString stringWithFormat:@"Target: %@\nData: %@\nFiles: %@; bytes: %@\nCreate Applications directory: %@\nPlan SHA-256: %@",p[@"target"],p[@"dataRoot"],p[@"entries"],p[@"totalBytes"],[p[@"createApplications"] boolValue]?@"yes":@"no",p[@"planHash"]];self.statusLabel.stringValue=@"Review only. Nothing has been installed or launched.";[self updateControls];return;
 }
 if([operation isEqual:@"cancel"]&&[phase isEqual:@"cancelled"]){self.phase=@"cancelled";self.review=nil;self.statusLabel.stringValue=@"Review cancelled. No installation was requested.";[self updateControls];return;}
 if(([@[@"confirm",@"resume"] containsObject:operation])&&[phase isEqual:@"committed"]){
  NSDictionary *p=reply[@"installation"];BOOL bound=[p isKindOfClass:NSDictionary.class]&&SEPPath(p[@"target"])&&SEPPattern(p[@"transactionId"],@"^[a-f0-9]{32}$")&&SEPBoolean(p[@"applicationStarted"])&&![p[@"applicationStarted"] boolValue]&&[p[@"transactionId"] isEqual:self.acceptedTransaction];
  if([operation isEqual:@"confirm"])bound=bound&&[p[@"target"] isEqual:self.acceptedReview[@"target"]];if(!bound){[self block:@"SEP_INSTALLER_UI_COMMIT_MISMATCH"];return;}
  self.phase=@"committed";self.installedPath=p[@"target"];self.acceptedReview=nil;self.statusLabel.stringValue=@"Installation committed. DSH SEP has not been started. Open it separately if desired.";[self updateControls];return;
 }
 if([operation isEqual:@"close"]&&[phase isEqual:@"closed"]&&SEPBoolean(reply[@"resourcesReleased"])&&[reply[@"resourcesReleased"] boolValue]){self.closeReceipt=YES;self.phase=@"closing";self.statusLabel.stringValue=@"Controller released; waiting for actual child exit.";[self reconcileClose];return;}
 [self block:@"SEP_INSTALLER_UI_RESPONSE"];
}
- (void)refreshPreview:(id)sender {(void)sender;if(self.buttons[@"refresh-preview"].enabled)[self request:@"preview" input:@{} initial:NO];}
- (void)listRecovery:(id)sender {(void)sender;if(self.buttons[@"list-recovery"].enabled)[self request:@"listRecovery" input:@{} initial:NO];}
- (void)cancelReview:(id)sender {(void)sender;if(!self.buttons[@"cancel-review"].enabled)return;NSString *hash=self.review[@"planHash"];self.review=nil;[self request:@"cancel" input:@{@"planHash":hash} initial:NO];}
- (void)install:(id)sender {
 (void)sender;if(!self.buttons[@"install"].enabled)return;NSDictionary *review=self.review;self.dialog=YES;[self updateControls];
 NSAlert *alert=[NSAlert new];self.alert=alert;alert.messageText=@"Install this reviewed DSH SEP package?";alert.informativeText=[NSString stringWithFormat:@"Target: %@\nPlan SHA-256: %@\nThis action installs the application but does not start it.",review[@"target"],review[@"planHash"]];[alert addButtonWithTitle:@"Install"];[alert addButtonWithTitle:@"Cancel"];
 __weak SEPInstallerUI *weak=self;[alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response){SEPInstallerUI *ui=weak;if(!ui)return;ui.alert=nil;ui.dialog=NO;if(ui.closingAdmission||ui.busy||ui.childExited||![ui.phase isEqual:@"preview"]||![ui.review isEqual:review]){[ui updateControls];return;}if(response!=NSAlertFirstButtonReturn){[ui updateControls];return;}ui.acceptedReview=review;ui.acceptedTransaction=review[@"transactionId"];ui.review=nil;[ui request:@"confirm" input:@{@"planHash":review[@"planHash"]} initial:NO];}];
}
- (void)resume:(id)sender {
 (void)sender;if(!self.buttons[@"resume"].enabled)return;NSDictionary *row=self.rows[self.recoveries.selectedRow];self.dialog=YES;[self updateControls];
 NSAlert *alert=[NSAlert new];self.alert=alert;alert.messageText=@"Review and resume this recorded installation?";alert.informativeText=[NSString stringWithFormat:@"Transaction: %@\nRecorded phase: %@\nThe controller will revalidate its own records. A locator does not override blocked recovery or start the application.",row[@"transactionId"],row[@"phase"]];[alert addButtonWithTitle:@"Resume"];[alert addButtonWithTitle:@"Cancel"];
 __weak SEPInstallerUI *weak=self;[alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response){SEPInstallerUI *ui=weak;if(!ui)return;ui.alert=nil;ui.dialog=NO;if(response!=NSAlertFirstButtonReturn||ui.closingAdmission||ui.busy||ui.childExited||![ui.phase isEqual:@"recovery-list"]){[ui updateControls];return;}ui.acceptedTransaction=row[@"transactionId"];ui.acceptedReview=nil;[ui request:@"resume" input:@{@"transactionId":row[@"transactionId"]} initial:NO];}];
}
- (void)openInstalled:(id)sender {
 (void)sender;if(!self.buttons[@"open-installed"].enabled)return;self.busy=YES;[self updateControls];NSURL *url=[NSURL fileURLWithPath:self.installedPath isDirectory:YES];__weak SEPInstallerUI *weak=self;
 [self.opener openInstalledApplication:url completion:^(BOOL dispatched){dispatch_async(dispatch_get_main_queue(),^{SEPInstallerUI *ui=weak;if(!ui||ui.closingAdmission)return;ui.busy=NO;ui.statusLabel.stringValue=dispatched?@"Open dispatched to LaunchServices. Application health has not been verified.":@"Open failed. The committed installation has been preserved.";[ui updateControls];});}];
}
- (BOOL)windowShouldClose:(NSWindow *)sender {
 (void)sender;if(self.resourcesReleased)return YES;if(self.closingAdmission)return NO;
 if(self.busy||self.dialog){self.statusLabel.stringValue=@"An accepted operation is still running. Keep waiting; this window will not terminate its owner or start another operation.";return NO;}
 self.closingAdmission=YES;[self request:@"close" input:@{} initial:NO];NSUInteger ticket=self.serial;__weak SEPInstallerUI *weak=self;
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC),dispatch_get_main_queue(),^{SEPInstallerUI *ui=weak;if(ui&&ui.serial==ticket&&!ui.resourcesReleased)[ui block:@"SEP_INSTALLER_UI_CLOSE_UNCONFIRMED"];});return NO;
}
- (void)reconcileClose {if(!self.closingAdmission||!self.closeReceipt||!self.childExited||!self.childExitOK||[self.phase isEqual:@"blocked"])return;self.resourcesReleased=YES;self.phase=@"closed";self.busy=NO;[self updateControls];[self.window close];}
- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView {(void)tableView;return self.rows.count;}
- (id)tableView:(NSTableView *)tableView objectValueForTableColumn:(NSTableColumn *)tableColumn row:(NSInteger)row {(void)tableView;(void)tableColumn;NSDictionary *value=self.rows[row];return [NSString stringWithFormat:@"%@ — %@%@",value[@"transactionId"],value[@"phase"],value[@"code"]?[NSString stringWithFormat:@" (%@)",value[@"code"]]:@""];}
- (void)tableViewSelectionDidChange:(NSNotification *)notification {(void)notification;[self updateControls];}
@end
