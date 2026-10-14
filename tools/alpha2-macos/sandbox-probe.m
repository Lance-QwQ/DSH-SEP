// Synthetic native isolation probe. No user code, network or private documents.
#import <Foundation/Foundation.h>
#include <fcntl.h>
#include <errno.h>
#include <unistd.h>

static NSDictionary *child(NSString *exe, NSArray<NSString *> *args) {
    NSTask *task = [NSTask new]; NSPipe *output = [NSPipe pipe]; NSPipe *errors = [NSPipe pipe];
    task.executableURL = [NSURL fileURLWithPath:exe]; task.arguments = args;
    task.environment = @{ @"PATH": @"/usr/bin:/bin", @"LANG": @"C", @"HOME": NSHomeDirectory() };
    task.standardOutput = output; task.standardError = errors; task.standardInput = [NSFileHandle fileHandleWithNullDevice];
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) return @{ @"launched": @NO, @"code": @(error.code) };
    NSData *stdoutBytes = [output.fileHandleForReading readDataToEndOfFile];
    NSData *stderrBytes = [errors.fileHandleForReading readDataToEndOfFile]; [task waitUntilExit];
    NSString *text = [[NSString alloc] initWithData:stdoutBytes encoding:NSUTF8StringEncoding] ?: @"";
    return @{ @"launched": @YES, @"exit": @(task.terminationStatus), @"stdout": text,
              @"stderr": [[NSString alloc] initWithData:stderrBytes encoding:NSUTF8StringEncoding] ?: @"" };
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) return 64;
        NSString *original = [NSString stringWithUTF8String:argv[1]], *token = [NSString stringWithUTF8String:argv[2]];
        if (![original hasPrefix:@"/"] || [token rangeOfString:@"/"].location != NSNotFound || token.length > 80) return 64;
        NSString *home = NSHomeDirectory(), *work = [home stringByAppendingPathComponent:[@"Library/Application Support/DSHSEPProbe-" stringByAppendingString:token]];
        NSError *error = nil;
        if (![[NSFileManager defaultManager] createDirectoryAtPath:work withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:&error]) return 65;
        NSData *copy = [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
        if (copy.length > 65536 || ![copy writeToFile:[work stringByAppendingPathComponent:@"work-copy.txt"] options:NSDataWritingWithoutOverwriting error:&error]) return 66;
        errno = 0; int fd = open(original.fileSystemRepresentation, O_WRONLY | O_TRUNC); int denied = errno;
        if (fd >= 0) { (void)write(fd, "parent-escape", 13); close(fd); }
        NSString *node = [[[NSBundle mainBundle] bundlePath] stringByAppendingPathComponent:@"Contents/Helpers/node"];
        NSString *script = @"const fs=require('node:fs');fs.writeFileSync(process.argv[1],'node-work');let denied=false;try{fs.writeFileSync(process.argv[2],'node-escape')}catch(e){denied=e.code==='EPERM'||e.code==='EACCES'}console.log(JSON.stringify({sourceWriteDenied:denied,workWritten:true}));";
        NSDictionary *nodeResult = child(node, @[@"-e",script,[work stringByAppendingPathComponent:@"node-work.txt"],original]);
        NSString *shell = @"printf shell-work > \"$1\" || exit 3; if printf shell-escape > \"$2\"; then printf source-write-allowed; else printf source-write-denied; fi";
        NSDictionary *shellResult = child(@"/bin/sh", @[@"-c",shell,@"sep-probe",[work stringByAppendingPathComponent:@"shell-work.txt"],original]);
        NSDictionary *result = @{ @"schema": @1, @"uid": @(getuid()), @"home": home, @"work": work,
            @"sourceWriteDenied": @(fd < 0 && (denied == EPERM || denied == EACCES)), @"errno": @(denied),
            @"node": nodeResult, @"shell": shellResult, @"copyBytes": @(copy.length) };
        NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
        if (!json) return 67; [[NSFileHandle fileHandleWithStandardOutput] writeData:json];
        [[NSFileHandle fileHandleWithStandardOutput] writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
    }
    return 0;
}
