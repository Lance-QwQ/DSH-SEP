#import <AppKit/AppKit.h>
#import <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

/* Synthetic AppKit/IPC probe only. No actual broker or production resource
 * manifest is connected, and the non-test build rejects execution. */
#ifdef SEP_BOOTSTRAP_TESTING
static BOOL exact(NSDictionary *v, NSArray *keys) {
  return [v isKindOfClass:NSDictionary.class] && [[NSSet setWithArray:v.allKeys] isEqualToSet:[NSSet setWithArray:keys]];
}
static BOOL hex(NSString *v, NSUInteger n) {
  return [v isKindOfClass:NSString.class] && v.length==n && [v rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet]].location==NSNotFound;
}
static BOOL boolean(id v,BOOL expected) {
  return v && CFGetTypeID((__bridge CFTypeRef)v)==CFBooleanGetTypeID() && [v boolValue]==expected;
}
static NSString *randomHex(size_t n) {
  unsigned char b[32]; if(n>sizeof b) return nil; arc4random_buf(b,n);
  NSMutableString *s=[NSMutableString stringWithCapacity:n*2];
  for(size_t i=0;i<n;i++) [s appendFormat:@"%02x",b[i]]; return s;
}
static void output(NSDictionary *v) {
  NSData *b=[NSJSONSerialization dataWithJSONObject:v options:0 error:NULL];
  if(b) fwrite(b.bytes,1,b.length,stdout); fputc('\n',stdout); fflush(stdout);
}
static BOOL snapshot(NSString *path,uint64_t maximum,NSData **contents,NSString **digest) {
  if(![path isKindOfClass:NSString.class] || ![path hasPrefix:@"/"] || [path rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location!=NSNotFound) return NO;
  char canonical[PATH_MAX];
  if(!realpath(path.fileSystemRepresentation,canonical) || strcmp(canonical,path.fileSystemRepresentation)) return NO;
  int fd=open(canonical,O_RDONLY|O_NOFOLLOW|O_CLOEXEC); if(fd<0) return NO;
  struct stat a,b; BOOL ok=fstat(fd,&a)==0 && S_ISREG(a.st_mode) && a.st_nlink==1 && a.st_uid==geteuid() && a.st_size>=0 && (uint64_t)a.st_size<=maximum;
  CC_SHA256_CTX state; CC_SHA256_Init(&state); uint64_t total=0;
  NSMutableData *data=contents?[NSMutableData data]:nil;
  while(ok) {
    unsigned char buf[65536]; ssize_t n=read(fd,buf,sizeof buf);
    if(n<0 && errno==EINTR) continue; if(n<0) { ok=NO; break; } if(!n) break;
    total+=(uint64_t)n; if(total>maximum) { ok=NO; break; }
    CC_SHA256_Update(&state,buf,(CC_LONG)n); [data appendBytes:buf length:(NSUInteger)n];
  }
  ok=ok && fstat(fd,&b)==0 && a.st_dev==b.st_dev && a.st_ino==b.st_ino && a.st_size==b.st_size && total==(uint64_t)a.st_size && a.st_mtimespec.tv_sec==b.st_mtimespec.tv_sec && a.st_mtimespec.tv_nsec==b.st_mtimespec.tv_nsec && a.st_ctimespec.tv_sec==b.st_ctimespec.tv_sec && a.st_ctimespec.tv_nsec==b.st_ctimespec.tv_nsec;
  close(fd); unsigned char bytes[CC_SHA256_DIGEST_LENGTH]; CC_SHA256_Final(bytes,&state);
  if(!ok) return NO; if(contents) *contents=data;
  if(digest) { NSMutableString *s=[NSMutableString stringWithCapacity:64]; for(size_t i=0;i<sizeof bytes;i++) [s appendFormat:@"%02x",bytes[i]]; *digest=s; }
  return YES;
}
@interface Bootstrap : NSObject <NSApplicationDelegate>
@property(nonatomic,strong) NSDictionary *config;
@property(nonatomic,strong) NSString *nonce,*generation,*activation,*quit,*failure;
@property(nonatomic,strong) NSMutableData *incoming,*outgoing;
@property(nonatomic,strong) NSTimer *timer;
@property(nonatomic) int channel,childStatus,result;
@property(nonatomic) pid_t child;
@property(nonatomic) BOOL childExited,childUnconfirmed,channelEOF,desktopReady,activated,quitCancelled,closing,cleanReceipt,finished,cleanupStarted,cleanupKilled,protocolBroken,terminationPending;
@property(nonatomic) double deadline,cleanupDeadline;
- (void)poll:(NSTimer *)timer;
- (void)queueSyntheticQuit;
@end
@implementation Bootstrap
- (void)block:(NSString *)code { if(!self.failure) self.failure=code; self.protocolBroken=YES; }
- (void)send:(NSString *)kind extra:(NSDictionary *)extra {
  NSMutableDictionary *v=[@{@"protocol":@1,@"kind":kind,@"nonce":self.nonce,@"programSha256":self.config[@"programSha256"]} mutableCopy];
  if(self.generation) v[@"generation"]=self.generation; [v addEntriesFromDictionary:extra];
  NSData *b=[NSJSONSerialization dataWithJSONObject:v options:0 error:NULL];
  if(!b || b.length>4096 || self.outgoing.length+b.length+1>8192) { [self block:@"SEP_BOOTSTRAP_FRAME"]; return; }
  [self.outgoing appendData:b]; [self.outgoing appendBytes:"\n" length:1];
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)visible {
  (void)sender; (void)visible;
  if(self.failure || self.finished || self.closing || self.quit || !self.desktopReady) return NO;
  if(!self.activation) { self.activation=randomHex(12); [self send:@"activate" extra:@{@"requestId":self.activation}]; } return YES;
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
  (void)sender; if(self.failure || self.finished) return NSTerminateCancel;
  if(!self.quit && self.generation) { self.quit=randomHex(12); [self send:@"requestQuit" extra:@{@"requestId":self.quit}]; }
  self.terminationPending=YES;
  return NSTerminateLater;
}
- (void)queueSyntheticQuit {
  /* Do not enter AppKit's nested modal loop inside the repeating timer itself. */
  [NSRunLoop.mainRunLoop performInModes:@[NSDefaultRunLoopMode] block:^{ if(!self.finished && !self.failure) [NSApp terminate:nil]; }];
}
- (void)receive:(NSDictionary *)v {
  NSDictionary *extensions=@{@"owned":@[],@"ready":@[@"desktopReady"],@"activated":@[@"requestId"],@"quitCancelled":@[@"requestId"],@"quitting":@[],@"closed":@[@"status",@"resourcesConfirmedReleased"],@"blocked":@[@"code",@"resourcesConfirmedReleased"]};
  if(![v isKindOfClass:NSDictionary.class] || ![v[@"kind"] isKindOfClass:NSString.class]) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
  NSString *kind=v[@"kind"]; NSArray *extra=extensions[kind];
  NSArray *keys=[@[@"protocol",@"kind",@"nonce",@"programSha256",@"generation"] arrayByAddingObjectsFromArray:extra?:@[]];
  if(!extra || !exact(v,keys) || ![v[@"protocol"] isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)v[@"protocol"])==CFBooleanGetTypeID() || ![v[@"protocol"] isEqual:@1] || ![v[@"nonce"] isEqual:self.nonce] || ![v[@"programSha256"] isEqual:self.config[@"programSha256"]] || !hex(v[@"generation"],32) || (self.generation && ![v[@"generation"] isEqual:self.generation])) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
  if([kind isEqual:@"owned"]) { if(self.generation) [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; else self.generation=v[@"generation"]; return; }
  if(!self.generation) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
  if([kind isEqual:@"ready"]) {
    if(!boolean(v[@"desktopReady"],YES) || self.desktopReady || self.cleanReceipt) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
    self.desktopReady=YES; [self applicationShouldHandleReopen:NSApp hasVisibleWindows:NO]; return;
  }
  if([kind isEqual:@"activated"]) {
    if(!self.activation || ![v[@"requestId"] isEqual:self.activation]) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
    self.activation=nil; self.activated=YES; [self queueSyntheticQuit]; return;
  }
  if([kind isEqual:@"quitCancelled"]) {
    if(!self.quit || ![v[@"requestId"] isEqual:self.quit] || self.cleanReceipt || self.failure) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
    self.quit=nil; self.quitCancelled=YES; self.terminationPending=NO; [NSApp replyToApplicationShouldTerminate:NO];
    [self queueSyntheticQuit]; return;
  }
  if([kind isEqual:@"quitting"]) { if(self.cleanReceipt) [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; else self.closing=YES; return; }
  if([kind isEqual:@"blocked"]) {
    NSString *code=v[@"code"]; NSRegularExpression *p=[NSRegularExpression regularExpressionWithPattern:@"^SEP_[A-Z0-9_]{1,90}$" options:0 error:NULL];
    if(!boolean(v[@"resourcesConfirmedReleased"],NO) || ![code isKindOfClass:NSString.class] || [p numberOfMatchesInString:code options:0 range:NSMakeRange(0,code.length)]!=1) [self block:@"SEP_BOOTSTRAP_PROTOCOL"];
    else self.failure=code; /* Valid blocked may later supply actual cleanup. */
    return;
  }
  if(![v[@"status"] isEqual:@"pass"] || !boolean(v[@"resourcesConfirmedReleased"],YES) || self.cleanReceipt) { [self block:@"SEP_BOOTSTRAP_PROTOCOL"]; return; }
  self.cleanReceipt=YES; self.closing=YES;
}
- (BOOL)spawnController {
  int pair[2]; if(socketpair(AF_UNIX,SOCK_STREAM,0,pair)) return NO;
  /* Move both ends away from 3 before constructing the child's explicit FD3. */
  int parent=fcntl(pair[0],F_DUPFD_CLOEXEC,10),child=fcntl(pair[1],F_DUPFD_CLOEXEC,10); close(pair[0]); close(pair[1]);
  if(parent<0 || child<0) { if(parent>=0) close(parent); if(child>=0) close(child); return NO; }
  int one=1;
  if(setsockopt(parent,SOL_SOCKET,SO_NOSIGPIPE,&one,sizeof one) || fcntl(parent,F_SETFL,O_NONBLOCK)) { close(parent); close(child); return NO; }
  posix_spawn_file_actions_t actions; posix_spawnattr_t attributes;
  int status=posix_spawn_file_actions_init(&actions); if(status) { close(parent); close(child); return NO; }
  status=posix_spawnattr_init(&attributes); if(status) { posix_spawn_file_actions_destroy(&actions); close(parent); close(child); return NO; }
  status=posix_spawnattr_setflags(&attributes,POSIX_SPAWN_CLOEXEC_DEFAULT);
  if(!status) status=posix_spawn_file_actions_addopen(&actions,0,"/dev/null",O_RDONLY,0);
  if(!status) status=posix_spawn_file_actions_addopen(&actions,1,"/dev/null",O_WRONLY,0);
  if(!status) status=posix_spawn_file_actions_addopen(&actions,2,"/dev/null",O_WRONLY,0);
  if(!status) status=posix_spawn_file_actions_adddup2(&actions,child,3);
  if(!status) status=posix_spawn_file_actions_addclose(&actions,parent);
  if(!status) status=posix_spawn_file_actions_addclose(&actions,child);
  const char *node=[self.config[@"node"] fileSystemRepresentation];
  char *args[]={(char *)node,(char *)[self.config[@"controller"] fileSystemRepresentation],(char *)[self.config[@"scenario"] UTF8String],NULL};
  char *env[]={"PATH=/usr/bin:/bin",NULL}; pid_t pid=-1;
  if(!status) status=posix_spawn(&pid,node,&actions,&attributes,args,env);
  posix_spawnattr_destroy(&attributes); posix_spawn_file_actions_destroy(&actions); close(child);
  if(status) { close(parent); return NO; } self.channel=parent; self.child=pid; return YES;
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  (void)notification; self.incoming=[NSMutableData data]; self.outgoing=[NSMutableData data];
  self.nonce=randomHex(32); self.channel=-1; self.child=-1;
  self.deadline=NSProcessInfo.processInfo.systemUptime+[self.config[@"deadlineMs"] doubleValue]/1000.0;
  if(![self spawnController]) [self block:@"SEP_BOOTSTRAP_SPAWN"]; else [self send:@"initialize" extra:@{}];
  self.timer=[NSTimer timerWithTimeInterval:0.01 target:self selector:@selector(poll:) userInfo:nil repeats:YES];
  [NSRunLoop.mainRunLoop addTimer:self.timer forMode:NSRunLoopCommonModes];
}
- (void)finish:(BOOL)pass {
  if(self.finished) return; self.finished=YES; [self.timer invalidate]; self.timer=nil;
  if(self.channel>=0) { close(self.channel); self.channel=-1; } self.result=pass?0:70;
  int exitStatus=self.childStatus; // Darwin wait macros require an addressable int.
  NSMutableDictionary *receipt=[@{@"status":pass?@"pass":@"blocked",@"resourcesConfirmedReleased":@(pass),@"desktopReady":@(self.desktopReady),@"activated":@(self.activated),@"quitCancelled":@(self.quitCancelled),@"cleanControllerExit":@((BOOL)(self.childExited && WIFEXITED(exitStatus) && WEXITSTATUS(exitStatus)==0)),@"scope":@"synthetic-bootstrap-contract"} mutableCopy];
  if(!pass) { receipt[@"code"]=self.failure?:@"SEP_BOOTSTRAP_EXIT_UNCONFIRMED"; receipt[@"fixtureCleanup"]=@"separate-test-cleanup"; receipt[@"fixtureChildReaped"]=@((BOOL)(self.childExited || self.child<0)); }
  output(receipt);
  if(self.terminationPending) { self.terminationPending=NO; [NSApp replyToApplicationShouldTerminate:pass]; }
  /* Leaving a blocked synthetic fixture is test cleanup, not a production
   * owner policy. A real unknown owner must retain quarantine and its lease. */
  [NSApp stop:nil];
  [NSApp postEvent:[NSEvent otherEventWithType:NSEventTypeApplicationDefined location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:0 context:nil subtype:0 data1:0 data2:0] atStart:NO];
}
- (void)poll:(NSTimer *)timer {
  (void)timer;
  if(self.finished) return;
  if(!self.protocolBroken && self.channel>=0 && !self.channelEOF) {
    while(self.outgoing.length) {
      ssize_t n=write(self.channel,self.outgoing.bytes,self.outgoing.length);
      if(n<0 && errno==EINTR) continue; if(n<0 && (errno==EAGAIN || errno==EWOULDBLOCK)) break;
      if(n<=0) { [self block:@"SEP_BOOTSTRAP_CHANNEL"]; break; }
      [self.outgoing replaceBytesInRange:NSMakeRange(0,(NSUInteger)n) withBytes:NULL length:0];
    }
    while(!self.protocolBroken) {
      unsigned char bytes[512]; ssize_t n=read(self.channel,bytes,sizeof bytes);
      if(n<0 && errno==EINTR) continue; if(n<0 && (errno==EAGAIN || errno==EWOULDBLOCK)) break;
      if(n<0) { [self block:@"SEP_BOOTSTRAP_CHANNEL"]; break; }
      if(!n) {
        self.channelEOF=YES;
        // Finish our write half too: peer end() alone does not end its read half.
        if(shutdown(self.channel,SHUT_WR) && errno!=ENOTCONN) [self block:@"SEP_BOOTSTRAP_CHANNEL"];
        if(self.incoming.length) [self block:@"SEP_BOOTSTRAP_FRAME"]; break;
      }
      for(ssize_t i=0;i<n && !self.protocolBroken;i++) {
        if(bytes[i]=='\n') {
          id v=[NSJSONSerialization JSONObjectWithData:self.incoming options:0 error:NULL]; [self.incoming setLength:0];
          if(![v isKindOfClass:NSDictionary.class]) [self block:@"SEP_BOOTSTRAP_FRAME"]; else [self receive:v];
        } else if(self.incoming.length==4096) [self block:@"SEP_BOOTSTRAP_FRAME"];
        else [self.incoming appendBytes:&bytes[i] length:1];
      }
    }
  }
  if(self.child>0 && !self.childExited) {
    int status=0; pid_t pid=waitpid(self.child,&status,WNOHANG);
    if(pid==self.child) { self.childExited=YES; self.childStatus=status; }
    else if(pid<0 && errno!=EINTR) { self.childUnconfirmed=YES; [self block:@"SEP_BOOTSTRAP_WAIT_UNCONFIRMED"]; }
  }
  int exitStatus=self.childStatus;
  if(!self.protocolBroken && self.cleanReceipt && self.childExited && self.channelEOF && WIFEXITED(exitStatus) && WEXITSTATUS(exitStatus)==0) { [self finish:YES]; return; }
  if(!self.protocolBroken && self.childExited && self.channelEOF) [self block:@"SEP_BOOTSTRAP_EXIT_UNCONFIRMED"];
  double now=NSProcessInfo.processInfo.systemUptime;
  if(!self.protocolBroken && now>=self.deadline) [self block:@"SEP_BOOTSTRAP_DEADLINE"];
  if(self.protocolBroken) {
    /* The fixed fixture does not fork. These signals are not evidence for an
     * arbitrary process family or actual broker's cleanup. */
    if(self.childUnconfirmed) { [self finish:NO]; return; }
    if(!self.cleanupStarted) { self.cleanupStarted=YES; self.cleanupDeadline=now+1; if(self.child>0 && !self.childExited) kill(self.child,SIGTERM); }
    if(self.child<0 || self.childExited) { [self finish:NO]; return; }
    if(!self.cleanupKilled && now>=self.cleanupDeadline) { self.cleanupKilled=YES; self.cleanupDeadline=now+1; kill(self.child,SIGKILL); }
    else if(self.cleanupKilled && now>=self.cleanupDeadline) [self finish:NO];
  }
}
@end
static NSDictionary *descriptor(const char *path) {
  NSData *bytes; if(!snapshot([NSString stringWithUTF8String:path],16384,&bytes,NULL)) return nil;
  NSDictionary *v=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL];
  if(!exact(v,@[@"schema",@"scope",@"node",@"nodeSha256",@"controller",@"controllerSha256",@"programSha256",@"scenario",@"deadlineMs"]) || ![v[@"schema"] isEqual:@1] || ![v[@"scope"] isEqual:@"synthetic-bootstrap-contract"] || !hex(v[@"nodeSha256"],64) || !hex(v[@"controllerSha256"],64) || !hex(v[@"programSha256"],64) || ![@[@"clean",@"cancel-then-quit",@"exit-without-proof",@"wrong-nonce",@"quit-no-reply"] containsObject:v[@"scenario"]] || ![v[@"deadlineMs"] isKindOfClass:NSNumber.class] || [v[@"deadlineMs"] doubleValue]<100 || [v[@"deadlineMs"] doubleValue]>10000) return nil;
  NSString *a,*b;
  if(!snapshot(v[@"node"],256ULL*1024*1024,NULL,&a) || ![a isEqual:v[@"nodeSha256"]] || !snapshot(v[@"controller"],1024*1024,NULL,&b) || ![b isEqual:v[@"controllerSha256"]]) return nil;
  return v;
}
#endif
int main(int argc,const char *argv[]) {
  @autoreleasepool {
#ifdef SEP_BOOTSTRAP_TESTING
    NSDictionary *config=argc==3 && !strcmp(argv[1],"--synthetic-contract")?descriptor(argv[2]):nil;
    if(!config) { output(@{@"status":@"blocked",@"code":@"SEP_BOOTSTRAP_CONFIG",@"resourcesConfirmedReleased":@NO,@"fixtureCleanup":@"separate-test-cleanup"}); return 78; }
    [NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    Bootstrap *delegate=[Bootstrap new]; delegate.config=config; delegate.result=70;
    NSApp.delegate=delegate; [NSApp run]; return delegate.result;
#else
    (void)argc; (void)argv;
    puts("{\"status\":\"blocked\",\"code\":\"SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED\",\"resourcesConfirmedReleased\":false}"); return 78;
#endif
  }
}
