#import "InstallerPipeTransport.h"
#import <CommonCrypto/CommonDigest.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <unistd.h>
#import <math.h>

static BOOL Exact(id value,NSArray *keys){return [value isKindOfClass:NSDictionary.class]&&[[NSSet setWithArray:[value allKeys]]isEqualToSet:[NSSet setWithArray:keys]];}
static BOOL Pattern(id value,NSString *pattern){if(![value isKindOfClass:NSString.class])return NO;NSRange range=[value rangeOfString:pattern options:NSRegularExpressionSearch];return range.location==0&&range.length==[value length];}
static BOOL Digest(id value){return Pattern(value,@"[a-f0-9]{64}");}
static BOOL Transaction(id value){return Pattern(value,@"[a-f0-9]{32}");}
static BOOL Boolean(id value){return [value isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID();}
static BOOL Integer(id value,double min,double max){if(![value isKindOfClass:NSNumber.class]||Boolean(value))return NO;double n=[value doubleValue];return isfinite(n)&&floor(n)==n&&n>=min&&n<=max;}
static BOOL Path(id value){return [value isKindOfClass:NSString.class]&&[value hasPrefix:@"/"]&&[value length]<=2048&&[value rangeOfString:@"[\\x00-\\x1f\\x7f]" options:NSRegularExpressionSearch].location==NSNotFound;}
static NSDictionary *Blocked(NSString *code){return @{@"status":@"blocked",@"phase":@"blocked",@"code":code};}
static BOOL Role(NSDictionary *role){
 if(!Exact(role,@[@"path",@"sha256"])||!Path(role[@"path"])||!Digest(role[@"sha256"]))return NO;
 int fd=open([role[@"path"]fileSystemRepresentation],O_RDONLY|O_NOFOLLOW|O_CLOEXEC);if(fd<0)return NO;
 struct stat before,after;BOOL valid=fstat(fd,&before)==0&&S_ISREG(before.st_mode)&&before.st_size>0&&before.st_size<=1024LL*1024*1024;
 CC_SHA256_CTX ctx;CC_SHA256_Init(&ctx);unsigned char block[65536];ssize_t count=0;
 while(valid&&(count=read(fd,block,sizeof(block)))>0)CC_SHA256_Update(&ctx,block,(CC_LONG)count);
 valid=valid&&count==0&&fstat(fd,&after)==0&&before.st_dev==after.st_dev&&before.st_ino==after.st_ino&&before.st_size==after.st_size&&before.st_mtimespec.tv_sec==after.st_mtimespec.tv_sec&&before.st_mtimespec.tv_nsec==after.st_mtimespec.tv_nsec&&before.st_ctimespec.tv_sec==after.st_ctimespec.tv_sec&&before.st_ctimespec.tv_nsec==after.st_ctimespec.tv_nsec;close(fd);
 unsigned char digest[CC_SHA256_DIGEST_LENGTH];CC_SHA256_Final(digest,&ctx);NSMutableString *hex=[NSMutableString new];for(int i=0;i<CC_SHA256_DIGEST_LENGTH;i++)[hex appendFormat:@"%02x",digest[i]];return valid&&[hex isEqual:role[@"sha256"]];
}
static BOOL ValidRequest(NSString *operation,NSDictionary *input){
 if([@[@"preview",@"listRecovery",@"close"]containsObject:operation])return Exact(input,@[]);
 if([@[@"confirm",@"cancel"]containsObject:operation])return Exact(input,@[@"planHash"])&&Digest(input[@"planHash"]);
 return [operation isEqual:@"resume"]&&Exact(input,@[@"transactionId"])&&Transaction(input[@"transactionId"]);
}
static BOOL ValidResponse(NSDictionary *value,NSString *nonce,NSUInteger sequence,NSString *operation){
 NSArray *base=@[@"protocol",@"nonce",@"sequence",@"status",@"phase"];
 if(![value isKindOfClass:NSDictionary.class]||!Integer(value[@"protocol"],1,1)||![value[@"nonce"]isEqual:nonce]||!Integer(value[@"sequence"],sequence,sequence))return NO;
 NSString *phase=value[@"phase"],*status=value[@"status"];
 if([@[@"blocked",@"fail"]containsObject:status])return Exact(value,[base arrayByAddingObject:@"code"])&&[phase isEqual:@"blocked"]&&Pattern(value[@"code"],@"SEP_[A-Z0-9_]{1,90}");
 if(![status isEqual:@"pass"])return NO;
 NSDictionary *expected=@{@"preview":@"preview",@"listRecovery":@"recovery-list",@"confirm":@"committed",@"resume":@"committed",@"cancel":@"cancelled",@"close":@"closed"};if(![phase isEqual:expected[operation]])return NO;
 if([phase isEqual:@"cancelled"])return Exact(value,base);
 if([phase isEqual:@"closed"])return Exact(value,[base arrayByAddingObject:@"resourcesReleased"])&&Boolean(value[@"resourcesReleased"])&&[value[@"resourcesReleased"]boolValue];
 if([phase isEqual:@"preview"]){NSDictionary *p=value[@"preview"];return Exact(value,[base arrayByAddingObject:@"preview"])&&Exact(p,@[@"planHash",@"transactionId",@"target",@"dataRoot",@"entries",@"totalBytes",@"createApplications"])&&Digest(p[@"planHash"])&&Transaction(p[@"transactionId"])&&Path(p[@"target"])&&Path(p[@"dataRoot"])&&Integer(p[@"entries"],1,100000)&&Integer(p[@"totalBytes"],0,8589934592.0)&&Boolean(p[@"createApplications"]);}
 if([phase isEqual:@"committed"]){NSDictionary *p=value[@"installation"];return Exact(value,[base arrayByAddingObject:@"installation"])&&Exact(p,@[@"target",@"transactionId",@"applicationStarted"])&&Path(p[@"target"])&&Transaction(p[@"transactionId"])&&Boolean(p[@"applicationStarted"])&&![p[@"applicationStarted"]boolValue];}
 if(!Exact(value,[base arrayByAddingObject:@"recoveries"])||![value[@"recoveries"]isKindOfClass:NSArray.class]||[value[@"recoveries"]count]>64)return NO;
 NSMutableSet *seen=[NSMutableSet new];for(NSDictionary *row in value[@"recoveries"]){if(![row isKindOfClass:NSDictionary.class])return NO;BOOL blocked=[row[@"phase"]isEqual:@"blocked"];if(!Exact(row,blocked?@[@"transactionId",@"phase",@"code"]:@[@"transactionId",@"phase"])||!Transaction(row[@"transactionId"])||[seen containsObject:row[@"transactionId"]]||![@[@"confirmed",@"planned",@"executing",@"committed",@"blocked"]containsObject:row[@"phase"]]||(blocked&&!Pattern(row[@"code"],@"SEP_[A-Z0-9_]{1,90}")))return NO;[seen addObject:row[@"transactionId"]];}return YES;
}

@interface SEPInstallerPipeTransport ()
@property(nonatomic,strong) NSTask *task;
@property(nonatomic,strong) NSPipe *inputPipe,*outputPipe,*errorPipe;
@property(nonatomic,strong) NSMutableData *buffer;
@property(nonatomic,copy) NSString *nonce,*phase,*code,*pendingOperation;
@property(nonatomic,copy) void(^completion)(NSDictionary *);
@property(nonatomic,copy) void(^terminationObserver)(NSInteger,BOOL);
@property(nonatomic) NSUInteger sequence,requestsDispatched,stderrBytesBounded;
@property(nonatomic) BOOL started,admission,stdoutEOF,processExited,terminationDelivered,signalled;
@property(nonatomic) NSInteger exitCode;
@end
@implementation SEPInstallerPipeTransport
- (instancetype)initWithVerifiedConfiguration:(NSDictionary *)configuration manifestSHA:(NSString *)manifestSHA {
 if(!(self=[super init]))return nil;_buffer=[NSMutableData new];_phase=@"blocked";_code=@"SEP_INSTALLER_UI_CONFIGURATION";_exitCode=-1;
 if(!NSThread.isMainThread||![configuration isKindOfClass:NSDictionary.class]||!Digest(manifestSHA)||!Path(configuration[@"contents"]))return self;
 if(!Role(configuration[@"node"])||!Role(configuration[@"controller"])){_code=@"SEP_INSTALLER_UI_ROLE_CHANGED";return self;}
 unsigned char random[32];arc4random_buf(random,sizeof(random));NSMutableString *nonce=[NSMutableString new];for(NSUInteger i=0;i<sizeof(random);i++)[nonce appendFormat:@"%02x",random[i]];_nonce=[nonce copy];
 _task=[NSTask new];_task.executableURL=[NSURL fileURLWithPath:configuration[@"node"][@"path"]];_task.arguments=@[configuration[@"controller"][@"path"],_nonce,[manifestSHA copy]];_task.currentDirectoryURL=[NSURL fileURLWithPath:configuration[@"contents"]];_task.environment=@{@"PATH":@"/usr/bin:/bin",@"LANG":@"en_US.UTF-8"};
 _inputPipe=[NSPipe pipe];_outputPipe=[NSPipe pipe];_errorPipe=[NSPipe pipe];if(!_inputPipe||!_outputPipe||!_errorPipe){_code=@"SEP_INSTALLER_UI_PIPE";return self;}
 // Darwin per-descriptor suppression; no global SIGPIPE handler is changed.
 if(fcntl(_inputPipe.fileHandleForWriting.fileDescriptor,F_SETNOSIGPIPE,1)<0){_code=@"SEP_INSTALLER_UI_PIPE";return self;}
 _task.standardInput=_inputPipe;_task.standardOutput=_outputPipe;_task.standardError=_errorPipe;
 __weak typeof(self) weak=self;
 _outputPipe.fileHandleForReading.readabilityHandler=^(NSFileHandle *handle){@autoreleasepool{NSData *data;@try{data=[handle readDataUpToLength:16385 error:nil];}@catch(NSException *e){(void)e;data=nil;}if(!data){handle.readabilityHandler=nil;dispatch_async(dispatch_get_main_queue(),^{[weak block:@"SEP_INSTALLER_UI_PIPE"];});return;}if(!data.length)handle.readabilityHandler=nil;
  // Synchronize each bounded chunk with the owner thread, so the pipe itself
  // supplies backpressure instead of an unbounded queue of captured NSData.
  if(NSThread.isMainThread)[weak receive:data];else dispatch_sync(dispatch_get_main_queue(),^{[weak receive:data];});}};
 _errorPipe.fileHandleForReading.readabilityHandler=^(NSFileHandle *handle){@autoreleasepool{@try{NSData *data=[handle readDataUpToLength:65536 error:nil];if(!data){handle.readabilityHandler=nil;dispatch_async(dispatch_get_main_queue(),^{[weak block:@"SEP_INSTALLER_UI_PIPE"];});return;}if(!data.length)handle.readabilityHandler=nil;typeof(self) strong=weak;@synchronized(strong){strong.stderrBytesBounded=MIN((NSUInteger)65536,strong.stderrBytesBounded+MIN((NSUInteger)65536,data.length));}}@catch(NSException *e){(void)e;handle.readabilityHandler=nil;dispatch_async(dispatch_get_main_queue(),^{[weak block:@"SEP_INSTALLER_UI_PIPE"];});}}};
 _task.terminationHandler=^(NSTask *task){dispatch_async(dispatch_get_main_queue(),^{typeof(self) strong=weak;if(!strong)return;strong.processExited=YES;strong.exitCode=task.terminationStatus;strong.signalled=task.terminationReason==NSTaskTerminationReasonUncaughtSignal;[strong maybeTerminate];});};
 NSError *error=nil;BOOL launched=NO;@try{launched=[_task launchAndReturnError:&error];}@catch(NSException *e){(void)e;}
 if(!launched){_outputPipe.fileHandleForReading.readabilityHandler=nil;_errorPipe.fileHandleForReading.readabilityHandler=nil;_code=@"SEP_INSTALLER_UI_START_FAILED";[self closeInput];return self;}
 _started=YES;_admission=YES;_phase=@"open";_code=nil;return self;
}
- (void)closeInput {@try{[_inputPipe.fileHandleForWriting closeFile];}@catch(NSException *e){(void)e;}}
- (void)block:(NSString *)code {
 if(![_phase isEqual:@"blocked"]||!_code){_phase=@"blocked";_code=code;}_admission=NO;[_buffer setLength:0];[self closeInput];void(^callback)(NSDictionary *)=_completion;_completion=nil;_pendingOperation=nil;if(callback)callback(Blocked(_code?:code));
}
- (void)receive:(NSData *)data {
 if(!data.length){_stdoutEOF=YES;_admission=NO;if(_completion||_buffer.length)[self block:@"SEP_INSTALLER_UI_INCOMPLETE"];[self maybeTerminate];return;}
 if([_phase isEqual:@"blocked"])return;
 if(!_completion||_buffer.length+data.length>16384){[self block:@"SEP_INSTALLER_UI_PROTOCOL"];return;}[_buffer appendData:data];
 const unsigned char *bytes=_buffer.bytes;NSUInteger newline=NSNotFound;for(NSUInteger i=0;i<_buffer.length;i++)if(bytes[i]==10){newline=i;break;}if(newline==NSNotFound)return;
 if(newline!=_buffer.length-1){[self block:@"SEP_INSTALLER_UI_PROTOCOL"];return;}
 NSData *payload=[_buffer subdataWithRange:NSMakeRange(0,newline)];NSString *utf8=[[NSString alloc]initWithData:payload encoding:NSUTF8StringEncoding];NSDictionary *value=nil;@try{if(utf8)value=[NSJSONSerialization JSONObjectWithData:payload options:0 error:nil];}@catch(NSException *e){(void)e;}
 if(!utf8||!ValidResponse(value,_nonce,_sequence,_pendingOperation)){[self block:@"SEP_INSTALLER_UI_PROTOCOL"];return;}
 [_buffer setLength:0];void(^callback)(NSDictionary *)=_completion;NSString *operation=_pendingOperation;_completion=nil;_pendingOperation=nil;
 if([value[@"phase"]isEqual:@"closed"]){_admission=NO;_phase=@"closed-receipt";[self closeInput];}
 else if([operation isEqual:@"close"]){_phase=@"blocked";_code=value[@"code"];} // Preserve unknown owner; no kill or synthetic EOF.
 callback(value);
}
- (void)maybeTerminate {
 if(!_processExited||!_stdoutEOF||_terminationDelivered)return;
 // Both callbacks run on the owner thread. receive() dispatches the final
 // complete frame before joining exit + EOF, irrespective of arrival order.
 if(_completion)[self block:@"SEP_INSTALLER_UI_INCOMPLETE"];
 if(!_terminationObserver)return;_terminationDelivered=YES;_admission=NO;void(^observer)(NSInteger,BOOL)=_terminationObserver;_terminationObserver=nil;observer(_exitCode,_signalled);
}
- (void)requestOperation:(NSString *)operation input:(NSDictionary *)input completion:(void (^)(NSDictionary *))completion {
 if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{completion(Blocked(@"SEP_INSTALLER_UI_THREAD"));});return;}
 if(!_started||!_admission){completion(Blocked(_code?:@"SEP_INSTALLER_UI_CLOSED"));return;}
 if(_completion){completion(Blocked(@"SEP_INSTALLER_UI_BUSY"));return;}
 if(!ValidRequest(operation,input)||_sequence>=10000){completion(Blocked(@"SEP_INSTALLER_UI_PROTOCOL"));return;}
 NSDictionary *request=@{@"protocol":@1,@"nonce":_nonce,@"sequence":@(_sequence+1),@"operation":operation,@"input":input};NSData *encoded=[NSJSONSerialization dataWithJSONObject:request options:0 error:nil];if(!encoded||encoded.length+1>4096){completion(Blocked(@"SEP_INSTALLER_UI_PROTOCOL"));return;}
 NSMutableData *frame=[encoded mutableCopy];[frame appendBytes:"\n" length:1];_sequence++;_requestsDispatched++;_pendingOperation=[operation copy];_completion=[completion copy];if([operation isEqual:@"close"])_admission=NO;
 @try{NSError *error=nil;if(![_inputPipe.fileHandleForWriting writeData:frame error:&error])[self block:@"SEP_INSTALLER_UI_PIPE"];}@catch(NSException *e){(void)e;[self block:@"SEP_INSTALLER_UI_PIPE"];}
}
- (void)observeTermination:(void (^)(NSInteger,BOOL))observer {
 if(!NSThread.isMainThread)return;if(_terminationObserver||_terminationDelivered)return;_terminationObserver=[observer copy];[self maybeTerminate];
}
- (NSDictionary *)snapshot {NSUInteger stderr;@synchronized(self){stderr=_stderrBytesBounded;}NSMutableDictionary *value=[@{@"started":@(_started),@"phase":_phase,@"requestsDispatched":@(_requestsDispatched),@"pending":@(_completion!=nil),@"stdoutEOF":@(_stdoutEOF),@"processExited":@(_processExited),@"terminationDelivered":@(_terminationDelivered),@"stderrBytesBounded":@(stderr),@"exitCode":@(_exitCode),@"signalled":@(_signalled)}mutableCopy];if(_code)value[@"code"]=_code;return value;}
@end
