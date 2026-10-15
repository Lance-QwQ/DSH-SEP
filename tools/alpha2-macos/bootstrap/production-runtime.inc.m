/* Connected product entry. No externally supplied path, argv, environment or
 * receipt grants authority. Only the private channel from our exact child does.
 * Unknown ownership is retained: this file never signals or kills a child. */
#include <pwd.h>
#include <sys/file.h>
#ifndef SEP_BOOTSTRAP_STARTUP_MS
#define SEP_BOOTSTRAP_STARTUP_MS 60000
#endif
#ifndef SEP_BOOTSTRAP_SHUTDOWN_MS
#define SEP_BOOTSTRAP_SHUTDOWN_MS 60000
#endif
static BOOL pcHex(id v,NSUInteger n) {
  return [v isKindOfClass:NSString.class] && [v length]==n && [v rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet]].location==NSNotFound;
}
static BOOL pcBool(id v,BOOL expected) {return v && CFGetTypeID((__bridge CFTypeRef)v)==CFBooleanGetTypeID() && [v boolValue]==expected;}
static BOOL pcCode(id v) {
  return [v isKindOfClass:NSString.class] && [v hasPrefix:@"SEP_"] && [v length]>4 && [v length]<=94 && [v rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"] invertedSet]].location==NSNotFound;
}
static NSString *pcRandom(size_t count) {
  unsigned char bytes[32];if(count>sizeof bytes)return nil;arc4random_buf(bytes,count);NSMutableString *value=[NSMutableString stringWithCapacity:count*2];for(size_t i=0;i<count;i++)[value appendFormat:@"%02x",bytes[i]];return value;
}
static void pcWarning(void) {const char *line="SEP_BOOTSTRAP_DIAGNOSTIC_UNAVAILABLE\n";(void)write(STDERR_FILENO,line,strlen(line));}
static BOOL pcPrivate(struct stat st,BOOL directory) {
  return st.st_uid==geteuid() && (st.st_mode&0777)==(directory?0700:0600) && (directory?S_ISDIR(st.st_mode):S_ISREG(st.st_mode)&&st.st_nlink==1);
}
static int pcReceiptDirectory(NSString *home) {
  char path[PATH_MAX];if(!realpath(home.fileSystemRepresentation,path) || strcmp(path,home.fileSystemRepresentation))return -1;
  int dir=open(path,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(dir<0)return -1;struct stat st;
  if(fstat(dir,&st) || !S_ISDIR(st.st_mode) || st.st_uid!=geteuid()){close(dir);return -1;}
  NSString *current=home;NSUInteger i=0;
  for(NSString *part in @[@"Library",@"Application Support",@"DSH SEP",@"alpha2-mac-finder-preview",@"launcher"]){
    if(mkdirat(dir,part.fileSystemRepresentation,0700) && errno!=EEXIST){close(dir);return -1;}
    int next=openat(dir,part.fileSystemRepresentation,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(dir);dir=next;if(dir<0)return -1;
    current=[current stringByAppendingPathComponent:part];
    if(fstat(dir,&st) || !S_ISDIR(st.st_mode) || st.st_uid!=geteuid() || (i>=2 && !pcPrivate(st,YES)) || !pLocation(dir,current)){close(dir);return -1;}i++;
  }
  return dir;
}
// This is diagnostic CAS, not the broker lease. A late old session must never
// replace the latest receipt after a newly-owned generation has published.
static BOOL pcPublish(NSString *home,NSDictionary *value,BOOL *published) {
  int dir=pcReceiptDirectory(home);if(dir<0)return NO;
  int lock=openat(dir,".bootstrap-ui.lock",O_RDWR|O_CREAT|O_NOFOLLOW|O_CLOEXEC,0600);struct stat st;BOOL ok=lock>=0 && fstat(lock,&st)==0 && pcPrivate(st,NO) && flock(lock,LOCK_EX|LOCK_NB)==0;
  if(!ok){if(lock>=0)close(lock);close(dir);return NO;}
  int old=openat(dir,"bootstrap-ui.json",O_RDONLY|O_NOFOLLOW|O_CLOEXEC);BOOL hadOld=old>=0;NSDictionary *prior=nil;struct stat before={0};
  if(old<0 && errno!=ENOENT)ok=NO;
  if(old>=0){
    if(fstat(old,&before) || !pcPrivate(before,NO) || before.st_size<2 || before.st_size>16384)ok=NO;
    if(ok){NSMutableData *bytes=[NSMutableData dataWithLength:(NSUInteger)before.st_size];size_t at=0;while(at<bytes.length){ssize_t n=read(old,(char *)bytes.mutableBytes+at,bytes.length-at);if(n<0 && errno==EINTR)continue;if(n<=0){ok=NO;break;}at+=(size_t)n;}if(ok)prior=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL];if(![prior isKindOfClass:NSDictionary.class] || !pcHex(prior[@"sessionId"],32) || !pcHex(prior[@"generation"],32))ok=NO;}
    close(old);
  }
  // Only the original owned event may claim a latest slot. If that publication
  // failed, a later ready/closed event must not overwrite another owner merely
  // because this instance has never successfully written a receipt before.
  if(ok && (*published || ![value[@"event"] isEqual:@"owned"]) && (!hadOld || ![prior[@"sessionId"] isEqual:value[@"sessionId"]] || ![prior[@"generation"] isEqual:value[@"generation"]]))ok=NO;
  if(ok && !*published && hadOld && [prior[@"generation"] isEqual:value[@"generation"]] && ![prior[@"sessionId"] isEqual:value[@"sessionId"]])ok=NO;
  NSData *data=ok?[NSJSONSerialization dataWithJSONObject:value options:0 error:NULL]:nil;if(!data || data.length>16384)ok=NO;
  NSString *temp=[NSString stringWithFormat:@".bootstrap-ui.%@.%@.tmp",value[@"sessionId"],value[@"sequence"]];int fd=ok?openat(dir,temp.fileSystemRepresentation,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600):-1;BOOL made=fd>=0;if(fd<0)ok=NO;
  if(ok){size_t at=0;while(at<data.length){ssize_t n=write(fd,(const char *)data.bytes+at,data.length-at);if(n<0&&errno==EINTR)continue;if(n<=0){ok=NO;break;}at+=(size_t)n;}if(ok && fsync(fd))ok=NO;}
  if(fd>=0)close(fd);
  if(ok){struct stat now;if(hadOld){if(fstatat(dir,"bootstrap-ui.json",&now,AT_SYMLINK_NOFOLLOW) || !pSame(before,now))ok=NO;}else if(fstatat(dir,"bootstrap-ui.json",&now,AT_SYMLINK_NOFOLLOW)==0 || errno!=ENOENT)ok=NO;}
  if(ok && renameat(dir,temp.fileSystemRepresentation,dir,"bootstrap-ui.json"))ok=NO;
  if(ok){*published=YES;if(fsync(dir))ok=NO;}else if(made)unlinkat(dir,temp.fileSystemRepresentation,0);
  flock(lock,LOCK_UN);close(lock);close(dir);return ok;
}
@interface ProductBootstrap : NSObject <NSApplicationDelegate>
@property(nonatomic,strong) NSDictionary *config;
@property(nonatomic,strong) NSString *home,*nonce,*sessionId,*generation,*activation,*quit,*lastCode,*phase;
@property(nonatomic,strong) NSMutableData *incoming,*outgoing;
@property(nonatomic,strong) NSTimer *timer;
@property(nonatomic,strong) NSWindow *diagnostic;
@property(nonatomic) int channel,childStatus,result;
@property(nonatomic) pid_t child;
@property(nonatomic) NSUInteger sequence;
@property(nonatomic) BOOL childExited,childUnknown,channelEOF,desktopReady,hadReady,failed,poisoned,cleanReceipt,released,terminationPending,latestPublished,finished,quitting;
@property(nonatomic) double startupDeadline,shutdownDeadline;
- (void)poll:(NSTimer *)timer;
- (void)finishLoop;
- (void)acknowledge:(id)sender;
@end
@implementation ProductBootstrap
- (void)emit:(NSString *)event {
  NSDictionary *value=@{@"schema":@1,@"scope":@"macos-app-v1-bootstrap",@"event":event,@"sequence":@(++self.sequence),@"bootstrapPid":@(getpid()),@"controllerPid":self.child>0?@(self.child):NSNull.null,@"sessionId":self.sessionId,@"programSha256":self.config[@"programSha256"]?:NSNull.null,@"generation":self.generation?:NSNull.null,@"phase":self.phase?:@"starting",@"desktopReady":@(self.desktopReady),@"resourcesConfirmedReleased":@(self.released),@"lastCode":self.lastCode?:NSNull.null,@"outcome":self.failed?@"failed":self.released?@"pass":self.hadReady?@"running":@"pending"};
  NSData *json=[NSJSONSerialization dataWithJSONObject:value options:0 error:NULL];NSMutableData *line=[json mutableCopy];[line appendBytes:"\n" length:1];
  int destination=!self.generation && [event isEqual:@"blocked"]?STDERR_FILENO:STDOUT_FILENO;
  if(!json || line.length>4096 || write(destination,line.bytes,line.length)!=(ssize_t)line.length)pcWarning();
  if(self.generation && self.home){BOOL published=self.latestPublished;if(!pcPublish(self.home,value,&published))pcWarning();self.latestPublished=published;}
}
- (void)showDiagnostic {
  if(!self.diagnostic){
    self.diagnostic=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,510,205) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];self.diagnostic.title=@"DSH SEP 启动与退出诊断";self.diagnostic.releasedWhenClosed=NO;
    NSButton *button=[NSButton buttonWithTitle:@"知道了" target:self action:@selector(acknowledge:)];button.frame=NSMakeRect(380,20,100,32);[self.diagnostic.contentView addSubview:button];[self.diagnostic center];
  }
  for(NSView *view in [self.diagnostic.contentView.subviews copy])if([view isKindOfClass:NSTextField.class])[view removeFromSuperview];
  NSString *detail=self.released?@"受控资源已经确认释放；本次启动或关闭仍记录为失败。可以关闭此提示并重试。":@"尚未确认受控任务全部收尾。为避免影响未知任务，当前实例保持隔离；请保留诊断信息，不要删除锁文件。";
  NSTextField *label=[NSTextField wrappingLabelWithString:[NSString stringWithFormat:@"%@\n\n%@",self.lastCode?:@"SEP_BOOTSTRAP_FAILED",detail]];label.frame=NSMakeRect(25,65,460,115);[self.diagnostic.contentView addSubview:label];[self.diagnostic makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
}
- (void)acknowledge:(id)sender {(void)sender;if(self.released || (!self.generation && (self.childExited || self.child<=0)))[NSApp terminate:nil];else [self.diagnostic orderOut:nil];}
- (void)block:(NSString *)code poison:(BOOL)poison {
  if(self.released)return;self.failed=YES;self.poisoned|=poison;BOOL changed=![self.phase isEqual:@"blocked"] || ![self.lastCode isEqual:code];self.phase=@"blocked";self.lastCode=code;self.shutdownDeadline=0;self.startupDeadline=0;
  if(self.terminationPending){self.terminationPending=NO;[NSApp replyToApplicationShouldTerminate:NO];}
  if(changed){[self emit:@"blocked"];[self showDiagnostic];}
}
- (void)send:(NSString *)kind extra:(NSDictionary *)extra {
  if(self.channel<0 || self.channelEOF || self.poisoned){[self block:@"SEP_BOOTSTRAP_CHANNEL" poison:YES];return;}
  NSMutableDictionary *frame=[@{@"protocol":@1,@"kind":kind,@"nonce":self.nonce,@"programSha256":self.config[@"programSha256"]} mutableCopy];if(self.generation)frame[@"generation"]=self.generation;[frame addEntriesFromDictionary:extra];
  NSData *bytes=[NSJSONSerialization dataWithJSONObject:frame options:0 error:NULL];if(!bytes || bytes.length>4096 || self.outgoing.length+bytes.length+1>32768){[self block:@"SEP_BOOTSTRAP_FRAME_LIMIT" poison:YES];return;}[self.outgoing appendData:bytes];[self.outgoing appendBytes:"\n" length:1];
}
- (void)activate {
  if(!self.generation || !self.desktopReady || self.failed || self.quitting || self.quit || self.released || self.activation)return;
  self.activation=pcRandom(12);[self send:@"activate" extra:@{@"requestId":self.activation}];
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)app hasVisibleWindows:(BOOL)visible {(void)app;(void)visible;if(self.failed)[self showDiagnostic];else [self activate];return NO;}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)app {(void)app;return NO;}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)app {
  (void)app;
  if(self.released || (!self.generation && (self.childExited || self.child<=0))){[self performSelector:@selector(finishLoop) withObject:nil afterDelay:0 inModes:@[NSDefaultRunLoopMode]];return NSTerminateCancel;}
  if(self.failed){[self showDiagnostic];return NSTerminateCancel;}
  if(!self.generation){[self block:@"SEP_BOOTSTRAP_STARTUP_NOT_OWNED" poison:NO];return NSTerminateCancel;}
  if(!self.quit && !self.quitting){self.quit=pcRandom(12);self.phase=@"closing";self.shutdownDeadline=NSProcessInfo.processInfo.systemUptime+SEP_BOOTSTRAP_SHUTDOWN_MS/1000.0;[self send:@"requestQuit" extra:@{@"requestId":self.quit}];[self emit:@"quit-requested"];}
  if(self.failed)return NSTerminateCancel;self.terminationPending=YES;return NSTerminateLater;
}
- (void)receive:(NSData *)bytes {
  NSString *line=[[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];NSDictionary *frame=line?[NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL]:nil;
  NSDictionary *extra=@{@"owned":@[],@"ready":@[@"desktopReady"],@"activated":@[@"requestId"],@"quitCancelled":@[@"requestId"],@"quitting":@[],@"blocked":@[@"code",@"resourcesConfirmedReleased"],@"closed":@[@"status",@"resourcesConfirmedReleased"]};
  if(![frame isKindOfClass:NSDictionary.class] || ![frame[@"kind"] isKindOfClass:NSString.class] || !extra[frame[@"kind"]]){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}
  NSArray *keys=[@[@"protocol",@"kind",@"nonce",@"programSha256",@"generation"] arrayByAddingObjectsFromArray:extra[frame[@"kind"]]];
  NSRegularExpression *keyPattern=[NSRegularExpression regularExpressionWithPattern:@"\"([^\"\\\\]*)\"\\s*:" options:0 error:NULL];NSArray *matches=[keyPattern matchesInString:line options:0 range:NSMakeRange(0,line.length)];NSMutableSet *seen=[NSMutableSet set];for(NSTextCheckingResult *match in matches)[seen addObject:[line substringWithRange:[match rangeAtIndex:1]]];
  if(!pExact(frame,keys) || matches.count!=keys.count || seen.count!=keys.count || ![frame[@"protocol"] isKindOfClass:NSNumber.class] || pcBool(frame[@"protocol"],YES) || ![frame[@"protocol"] isEqual:@1] || ![frame[@"nonce"] isEqual:self.nonce] || ![frame[@"programSha256"] isEqual:self.config[@"programSha256"]] || !pcHex(frame[@"generation"],32) || (self.generation && ![frame[@"generation"] isEqual:self.generation])){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}
  NSString *kind=frame[@"kind"];
  if([kind isEqual:@"owned"]){if(self.generation || self.cleanReceipt){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}self.generation=frame[@"generation"];[self emit:@"owned"];return;}
  if(!self.generation || self.cleanReceipt){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}
  if([kind isEqual:@"ready"]){if(!pcBool(frame[@"desktopReady"],YES) || self.hadReady || self.quitting){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}self.hadReady=YES;self.desktopReady=YES;self.startupDeadline=0;if(!self.failed && !self.quit)self.phase=@"running";[self emit:@"ready"];[self activate];return;}
  if([kind isEqual:@"activated"]){if(!self.activation || ![frame[@"requestId"] isEqual:self.activation]){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}self.activation=nil;[self emit:@"activated"];return;}
  if([kind isEqual:@"quitCancelled"]){if(!self.quit || ![frame[@"requestId"] isEqual:self.quit] || self.failed || self.quitting){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}self.quit=nil;self.shutdownDeadline=0;self.phase=self.hadReady?@"running":@"starting";if(self.terminationPending){self.terminationPending=NO;[NSApp replyToApplicationShouldTerminate:NO];}[self emit:@"quit-cancelled"];return;}
  if([kind isEqual:@"quitting"]){if(self.quitting){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}self.quitting=YES;if(!self.failed){self.phase=@"closing";if(!self.shutdownDeadline)self.shutdownDeadline=NSProcessInfo.processInfo.systemUptime+SEP_BOOTSTRAP_SHUTDOWN_MS/1000.0;}[self emit:@"quitting"];return;}
  if([kind isEqual:@"blocked"]){if(!pcBool(frame[@"resourcesConfirmedReleased"],NO) || !pcCode(frame[@"code"])){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}[self block:frame[@"code"] poison:NO];return;}
  if(![frame[@"status"] isEqual:@"pass"] || !pcBool(frame[@"resourcesConfirmedReleased"],YES)){[self block:@"SEP_BOOTSTRAP_PROTOCOL" poison:YES];return;}self.cleanReceipt=YES;
}
- (void)finishLoop {
  if(self.finished)return;self.finished=YES;[self.timer invalidate];[self.diagnostic orderOut:nil];[NSApp stop:nil];[NSApp postEvent:[NSEvent otherEventWithType:NSEventTypeApplicationDefined location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:0 context:nil subtype:0 data1:0 data2:0] atStart:NO];
}
- (void)poll:(NSTimer *)timer {
  (void)timer;if(self.finished || self.released)return;
  if(self.channel>=0 && !self.channelEOF && !self.poisoned){
    NSUInteger received=0,frames=0;BOOL stop=NO;
    while(!stop && received<32768){unsigned char buffer[4096];ssize_t count=read(self.channel,buffer,sizeof buffer);if(count<0 && errno==EINTR)continue;if(count<0 && (errno==EAGAIN||errno==EWOULDBLOCK))break;if(count<0){[self block:@"SEP_BOOTSTRAP_CHANNEL" poison:YES];break;}if(!count){self.channelEOF=YES;shutdown(self.channel,SHUT_WR);if(self.incoming.length)[self block:@"SEP_BOOTSTRAP_FRAME" poison:YES];break;}received+=(NSUInteger)count;
      for(ssize_t i=0;i<count;i++){unsigned char c=buffer[i];if(c=='\n'){if(++frames>32){[self block:@"SEP_BOOTSTRAP_FRAME_LIMIT" poison:YES];stop=YES;break;}NSData *line=[self.incoming copy];[self.incoming setLength:0];[self receive:line];if(self.poisoned){stop=YES;break;}}else{if(self.incoming.length>=4096){[self block:@"SEP_BOOTSTRAP_FRAME_LIMIT" poison:YES];stop=YES;break;}[self.incoming appendBytes:&c length:1];}}
    }
    if(self.outgoing.length && !self.channelEOF && !self.poisoned){ssize_t count=write(self.channel,self.outgoing.bytes,self.outgoing.length);if(count>0)[self.outgoing replaceBytesInRange:NSMakeRange(0,(NSUInteger)count) withBytes:NULL length:0];else if(count<0 && errno!=EINTR && errno!=EAGAIN && errno!=EWOULDBLOCK)[self block:@"SEP_BOOTSTRAP_CHANNEL" poison:YES];}
  }
  if(self.child>0 && !self.childExited && !self.childUnknown){int status=0;pid_t found=waitpid(self.child,&status,WNOHANG);if(found==self.child){self.childExited=YES;self.childStatus=status;}else if(found<0 && errno!=EINTR){self.childUnknown=YES;[self block:@"SEP_BOOTSTRAP_CHILD_UNKNOWN" poison:YES];}}
  int childStatus=self.childStatus;
  if(self.cleanReceipt && self.childExited && self.channelEOF && !self.poisoned && WIFEXITED(childStatus)){
    self.released=YES;self.desktopReady=NO;self.failed|=!self.hadReady || !self.quitting || WEXITSTATUS(childStatus)!=0;self.result=self.failed?1:0;self.phase=@"closed";self.startupDeadline=0;self.shutdownDeadline=0;[self emit:@"closed"];
    if(self.channel>=0){close(self.channel);self.channel=-1;}if(self.terminationPending){self.terminationPending=NO;[NSApp replyToApplicationShouldTerminate:NO];}
    if(self.failed)[self showDiagnostic];else [self performSelector:@selector(finishLoop) withObject:nil afterDelay:0 inModes:@[NSDefaultRunLoopMode]];return;
  }
  if((self.childExited && self.channelEOF) || (self.channelEOF && !self.cleanReceipt)){[self block:@"SEP_BOOTSTRAP_EXIT_UNCONFIRMED" poison:NO];return;}
  double now=NSProcessInfo.processInfo.systemUptime;
  if(self.startupDeadline && now>=self.startupDeadline)[self block:@"SEP_BOOTSTRAP_STARTUP_DEADLINE" poison:NO];
  else if(self.shutdownDeadline && now>=self.shutdownDeadline)[self block:@"SEP_BOOTSTRAP_SHUTDOWN_DEADLINE" poison:NO];
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  (void)notification;self.result=1;self.channel=-1;self.child=-1;self.phase=@"starting";self.nonce=pcRandom(32);self.sessionId=pcRandom(16);self.incoming=[NSMutableData data];self.outgoing=[NSMutableData data];
  if(!self.config){[self block:self.lastCode?:@"SEP_BOOTSTRAP_RESOURCE_IDENTITY" poison:YES];return;}
  struct passwd *account=getpwuid(geteuid());self.home=account?[NSString stringWithUTF8String:account->pw_dir]:nil;if(!self.home || ![self.home hasPrefix:@"/"]){[self block:@"SEP_BOOTSTRAP_ACCOUNT" poison:YES];return;}
  int pair[2];if(socketpair(AF_UNIX,SOCK_STREAM,0,pair)){[self block:@"SEP_BOOTSTRAP_CHANNEL" poison:YES];return;}
  int parent=fcntl(pair[0],F_DUPFD_CLOEXEC,10),child=fcntl(pair[1],F_DUPFD_CLOEXEC,10);close(pair[0]);close(pair[1]);if(parent<0 || child<0){if(parent>=0)close(parent);if(child>=0)close(child);[self block:@"SEP_BOOTSTRAP_CHANNEL" poison:YES];return;}
  int yes=1;setsockopt(parent,SOL_SOCKET,SO_NOSIGPIPE,&yes,sizeof yes);int flags=fcntl(parent,F_GETFL);if(flags<0 || fcntl(parent,F_SETFL,flags|O_NONBLOCK)){close(parent);close(child);[self block:@"SEP_BOOTSTRAP_CHANNEL" poison:YES];return;}
  posix_spawn_file_actions_t actions;posix_spawnattr_t attributes;int actionStatus=posix_spawn_file_actions_init(&actions),attrStatus=posix_spawnattr_init(&attributes);int error=actionStatus?actionStatus:attrStatus;
  if(!error)error=posix_spawnattr_setflags(&attributes,POSIX_SPAWN_CLOEXEC_DEFAULT);
  if(!error)error=posix_spawn_file_actions_adddup2(&actions,child,3);
  if(!error)error=posix_spawn_file_actions_addopen(&actions,STDIN_FILENO,"/dev/null",O_RDONLY,0);
  if(!error)error=posix_spawn_file_actions_addopen(&actions,STDOUT_FILENO,"/dev/null",O_WRONLY,0);
  if(!error)error=posix_spawn_file_actions_adddup2(&actions,STDERR_FILENO,STDERR_FILENO);
  if(!error)error=posix_spawn_file_actions_addclose(&actions,parent);
  if(!error)error=posix_spawn_file_actions_addclose(&actions,child);
  NSString *home=[@"HOME=" stringByAppendingString:self.home];char *argv[]={(char *)[self.config[@"node"] fileSystemRepresentation],(char *)[self.config[@"controller"] fileSystemRepresentation],NULL};char *env[]={"PATH=/usr/bin:/bin:/usr/sbin:/sbin",(char *)home.UTF8String,"LANG=en_US.UTF-8",NULL};pid_t pid=-1;
  if(!error)error=posix_spawn(&pid,argv[0],&actions,&attributes,argv,env);if(!actionStatus)posix_spawn_file_actions_destroy(&actions);if(!attrStatus)posix_spawnattr_destroy(&attributes);close(child);
  if(error){close(parent);[self block:@"SEP_BOOTSTRAP_SPAWN" poison:YES];return;}
  self.child=pid;self.channel=parent;self.startupDeadline=NSProcessInfo.processInfo.systemUptime+SEP_BOOTSTRAP_STARTUP_MS/1000.0;[self emit:@"starting"];[self send:@"initialize" extra:@{}];
  self.timer=[NSTimer timerWithTimeInterval:0.02 target:self selector:@selector(poll:) userInfo:nil repeats:YES];[NSRunLoop.mainRunLoop addTimer:self.timer forMode:NSRunLoopCommonModes];[NSRunLoop.mainRunLoop addTimer:self.timer forMode:NSModalPanelRunLoopMode];
}
@end
static int pConnectedMain(NSDictionary *config,NSString *failure) {
  signal(SIGPIPE,SIG_IGN);int flags=fcntl(STDOUT_FILENO,F_GETFL);if(flags>=0)fcntl(STDOUT_FILENO,F_SETFL,flags|O_NONBLOCK);
  [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];ProductBootstrap *owner=[ProductBootstrap new];owner.config=config;owner.lastCode=failure;NSApp.delegate=owner;[NSApp run];return owner.result;
}
