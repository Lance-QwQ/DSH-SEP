#import "installer-admission.h"
#import <CommonCrypto/CommonDigest.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/* Read/hash/location primitives are derived from the pinned source described in
 * ORIGIN.json. This validates an installed program, not arbitrary same-UID code.
 * In particular, an admitted path is not a permanent executable capability. */
#ifdef SEP_INSTALLER_MANIFEST_SHA256
static BOOL exact(id value,NSArray *keys) {
  return [value isKindOfClass:NSDictionary.class] && [[NSSet setWithArray:[value allKeys]] isEqualToSet:[NSSet setWithArray:keys]];
}
static BOOL hexHash(id value) {
  return [value isKindOfClass:NSString.class] && [value length]==64 && [value rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet]].location==NSNotFound;
}
static BOOL relativePath(id value) {
  if(![value isKindOfClass:NSString.class] || ![value length] || [value length]>1024)return NO;
  for(NSUInteger i=0;i<[value length];i++){unichar c=[value characterAtIndex:i];if(c<32 || c>126 || c=='\\' || c==':')return NO;}
  for(NSString *part in [value componentsSeparatedByString:@"/"])if(!part.length || [part isEqual:@"."] || [part isEqual:@".."] || [part hasSuffix:@"."] || [part hasSuffix:@" "])return NO;
  return YES;
}
static BOOL runtimePath(id value) {
  if(!relativePath(value) || ![value hasPrefix:@"Resources/runtime/"])return NO;
  for(NSString *part in [value componentsSeparatedByString:@"/"]){NSString *p=part.lowercaseString;if([p isEqual:@"test"] || [p isEqual:@"tests"] || [p isEqual:@"testing.mjs"] || [p isEqual:@"run-native.mjs"] || [p hasPrefix:@"fixture-"] || [p hasPrefix:@"fixture."] || [p containsString:@".test."])return NO;}
  return YES;
}
static NSDictionary *rolePaths(void) {
  return @{@"node":@"Resources/node/node",@"controller":@"Resources/runtime/installer-ui/controller-main.mjs",@"entryHelper":@"Resources/native/installer-account",@"coreHelper":@"Resources/native/first-install"};
}
static BOOL item(id value,NSString *path) {
  return exact(value,@[@"path",@"sha256"]) && relativePath(value[@"path"]) && (!path || [value[@"path"] isEqual:path]) && hexHash(value[@"sha256"]);
}
static BOOL shape(id value) {
  if(!exact(value,@[@"schema",@"layout",@"payload",@"node",@"controller",@"entryHelper",@"coreHelper",@"closure"]) || ![value[@"schema"] isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value[@"schema"])==CFBooleanGetTypeID() || ![value[@"schema"] isEqual:@1] || ![value[@"layout"] isEqual:@"macos-installer-v1"])return NO;
  id payload=value[@"payload"];
  if(!exact(payload,@[@"path",@"receipt",@"programSha256",@"bootstrapSha256"]) || ![payload[@"path"] isEqual:@"Resources/payload/DSH SEP.app"] || !item(payload[@"receipt"],@"Resources/PAYLOAD.json") || !hexHash(payload[@"programSha256"]) || !hexHash(payload[@"bootstrapSha256"]))return NO;
  NSDictionary *paths=rolePaths();for(NSString *role in paths)if(!item(value[role],paths[role]))return NO;
  id closure=value[@"closure"];if(![closure isKindOfClass:NSArray.class] || [closure count]==0 || [closure count]>1024)return NO;
  NSString *previous=@"";NSMutableSet *seen=[NSMutableSet set];BOOL controller=NO;
  for(id row in closure){if(!item(row,nil) || !runtimePath(row[@"path"]))return NO;NSString *path=row[@"path"];
    if([path compare:previous options:NSLiteralSearch]!=NSOrderedDescending || [seen containsObject:path.lowercaseString])return NO;
    previous=path;[seen addObject:path.lowercaseString];if([path isEqual:paths[@"controller"]]){if(![row[@"sha256"] isEqual:value[@"controller"][@"sha256"]])return NO;controller=YES;}
  }
  return controller;
}
static BOOL safe(struct stat value,BOOL directory) {
  return (directory?S_ISDIR(value.st_mode):(S_ISREG(value.st_mode) && value.st_nlink==1)) && (value.st_uid==geteuid() || value.st_uid==0) && !(value.st_mode&0022);
}
static BOOL same(struct stat a,struct stat b) {
  return a.st_dev==b.st_dev && a.st_ino==b.st_ino && a.st_mode==b.st_mode && a.st_uid==b.st_uid && a.st_gid==b.st_gid && a.st_nlink==b.st_nlink && a.st_size==b.st_size && a.st_mtimespec.tv_sec==b.st_mtimespec.tv_sec && a.st_mtimespec.tv_nsec==b.st_mtimespec.tv_nsec && a.st_ctimespec.tv_sec==b.st_ctimespec.tv_sec && a.st_ctimespec.tv_nsec==b.st_ctimespec.tv_nsec;
}
static BOOL location(int fd,NSString *path) {
  char bytes[PATH_MAX];if(fcntl(fd,F_GETPATH,bytes))return NO;NSString *actual=[NSString stringWithUTF8String:bytes];return actual && [actual isEqual:path];
}
static int openRelative(int root,NSString *contents,NSString *relative,BOOL directory) {
  if(!relativePath(relative))return -1;int fd=fcntl(root,F_DUPFD_CLOEXEC,10);if(fd<0)return -1;
  NSArray *parts=[relative componentsSeparatedByString:@"/"];NSString *path=contents;
  for(NSUInteger i=0;i<parts.count;i++){
    BOOL dir=i+1<parts.count || directory;NSString *part=parts[i];
    /* O_NONBLOCK prevents a swapped FIFO/device from blocking before fstat. */
    int next=openat(fd,part.fileSystemRepresentation,O_RDONLY|O_NONBLOCK|O_NOFOLLOW|O_CLOEXEC|(dir?O_DIRECTORY:0));close(fd);fd=next;if(fd<0)return -1;
    path=[path stringByAppendingPathComponent:part];struct stat value;if(fstat(fd,&value) || !safe(value,dir) || !location(fd,path)){close(fd);return -1;}
  }
  return fd;
}
#ifdef SEP_INSTALLER_ADMISSION_TEST_HOOK
extern BOOL SEPInstallerAdmissionTestCheckpoint(NSString *stage,NSString *relative);
#endif
static BOOL readBound(int root,NSString *contents,NSString *relative,uint64_t maximum,BOOL executable,NSData **body,NSString **digest,uint64_t *length) {
  int fd=openRelative(root,contents,relative,NO);if(fd<0)return NO;struct stat before,after;
  BOOL ok=fstat(fd,&before)==0 && before.st_size>=0 && (uint64_t)before.st_size<=maximum && (!executable || (before.st_mode&0111));
  CC_SHA256_CTX state;CC_SHA256_Init(&state);NSMutableData *buffer=body?[NSMutableData data]:nil;uint64_t total=0;
  while(ok){unsigned char bytes[65536];ssize_t n=read(fd,bytes,sizeof bytes);if(n<0 && errno==EINTR)continue;if(n<0){ok=NO;break;}if(!n)break;total+=(uint64_t)n;if(total>maximum){ok=NO;break;}CC_SHA256_Update(&state,bytes,(CC_LONG)n);[buffer appendBytes:bytes length:(NSUInteger)n];}
#ifdef SEP_INSTALLER_ADMISSION_TEST_HOOK
  if(ok)ok=SEPInstallerAdmissionTestCheckpoint(@"after-file-read",relative);
#endif
  ok=ok && fstat(fd,&after)==0 && same(before,after) && total==(uint64_t)before.st_size && location(fd,[contents stringByAppendingPathComponent:relative]);
  /* Reopen from the retained root: identical bytes at a replacement directory
   * are not the inode this read observed. */
  int check=ok?openRelative(root,contents,relative,NO):-1;if(check>=0){ok=fstat(check,&after)==0 && same(before,after);close(check);}else ok=NO;
  close(fd);unsigned char bytes[CC_SHA256_DIGEST_LENGTH];CC_SHA256_Final(bytes,&state);if(!ok)return NO;
  NSMutableString *hex=[NSMutableString stringWithCapacity:64];for(size_t i=0;i<sizeof bytes;i++)[hex appendFormat:@"%02x",bytes[i]];
  if(body)*body=[buffer copy];if(digest)*digest=[hex copy];if(length)*length=total;return YES;
}
static BOOL inventory(int dir,NSString *contents,NSString *relative,NSUInteger depth,NSUInteger *count,NSMutableSet *files) {
  if(depth>32 || !location(dir,[contents stringByAppendingPathComponent:relative]))return NO;
  struct stat before,after;if(fstat(dir,&before) || !safe(before,YES))return NO;
  int copy=fcntl(dir,F_DUPFD_CLOEXEC,10);if(copy<0)return NO;DIR *stream=fdopendir(copy);if(!stream){close(copy);return NO;}BOOL ok=YES;
  for(;;){errno=0;struct dirent *entry=readdir(stream);if(!entry){if(errno)ok=NO;break;}if(!strcmp(entry->d_name,".") || !strcmp(entry->d_name,".."))continue;
    if(++*count>2048){ok=NO;break;}NSString *name=[NSString stringWithUTF8String:entry->d_name];if(!name){ok=NO;break;}NSString *path=[relative stringByAppendingPathComponent:name];
    if(!runtimePath(path)){ok=NO;break;}struct stat value;if(fstatat(dir,entry->d_name,&value,AT_SYMLINK_NOFOLLOW)){ok=NO;break;}
    if(S_ISDIR(value.st_mode)){int child=openat(dir,entry->d_name,O_RDONLY|O_NONBLOCK|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(child<0){ok=NO;break;}struct stat held;ok=fstat(child,&held)==0 && same(value,held) && inventory(child,contents,path,depth+1,count,files);close(child);if(!ok)break;}
    else if(safe(value,NO)){if(files.count>=1024 || [files containsObject:path]){ok=NO;break;}[files addObject:path];}
    else{ok=NO;break;}
  }
  closedir(stream);return ok && fstat(dir,&after)==0 && same(before,after) && location(dir,[contents stringByAppendingPathComponent:relative]);
}
static BOOL matches(int root,NSString *contents,NSString *relative,NSString *expected,uint64_t maximum,BOOL executable,NSData **body,uint64_t *length,NSString **failure) {
  *failure=@"SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY";NSString *actual=nil;
  if(!readBound(root,contents,relative,maximum,executable,body,&actual,length))return NO;
  if(![actual isEqual:expected]){*failure=@"SEP_INSTALLER_ADMISSION_RESOURCE_CHANGED";return NO;}return YES;
}
static NSDictionary *verifyBundle(NSBundle *bundle,NSString *expected,NSString **failure) {
  *failure=@"SEP_INSTALLER_ADMISSION_BUNDLE_PATH";NSString *app=bundle.bundlePath;if(![app hasSuffix:@".app"])return nil;
  NSString *contents=[app stringByAppendingPathComponent:@"Contents"],*binary=[contents stringByAppendingPathComponent:@"MacOS/DSH SEP Installer"];
  if(![bundle.executablePath isEqual:binary])return nil;char canonical[PATH_MAX];if(!realpath(contents.fileSystemRepresentation,canonical) || strcmp(canonical,contents.fileSystemRepresentation))return nil;
  int root=open(contents.fileSystemRepresentation,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(root<0)return nil;struct stat before,after;
  BOOL ok=fstat(root,&before)==0 && safe(before,YES) && location(root,contents);NSDictionary *value=nil;NSData *manifest=nil;NSString *actual=nil;
  *failure=@"SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY";
  if(ok)ok=readBound(root,contents,@"Resources/INSTALLER.json",256ULL*1024,NO,&manifest,&actual,NULL);
  if(ok && ![actual isEqual:expected]){*failure=@"SEP_INSTALLER_ADMISSION_MANIFEST_CHANGED";ok=NO;}
  if(ok){value=[NSJSONSerialization JSONObjectWithData:manifest options:0 error:NULL];if(!shape(value)){*failure=@"SEP_INSTALLER_ADMISSION_MANIFEST";ok=NO;}}
  if(ok){int payload=openRelative(root,contents,value[@"payload"][@"path"],YES);ok=payload>=0;if(payload>=0)close(payload);}
  NSData *receiptBytes=nil;
  if(ok)ok=matches(root,contents,value[@"payload"][@"receipt"][@"path"],value[@"payload"][@"receipt"][@"sha256"],32ULL*1024*1024,NO,&receiptBytes,NULL,failure);
  if(ok){id receipt=[NSJSONSerialization JSONObjectWithData:receiptBytes options:0 error:NULL];if(![receipt isKindOfClass:NSDictionary.class] || ![receipt[@"programSha256"] isEqual:value[@"payload"][@"programSha256"]] || ![receipt[@"bootstrapSha256"] isEqual:value[@"payload"][@"bootstrapSha256"]]){*failure=@"SEP_INSTALLER_ADMISSION_MANIFEST";ok=NO;}}
  if(ok)ok=matches(root,contents,@"Resources/payload/DSH SEP.app/Contents/Resources/PROGRAM.json",value[@"payload"][@"programSha256"],256ULL*1024,NO,NULL,NULL,failure);
  if(ok)ok=matches(root,contents,@"Resources/payload/DSH SEP.app/Contents/Resources/BOOTSTRAP.json",value[@"payload"][@"bootstrapSha256"],256ULL*1024,NO,NULL,NULL,failure);
  if(ok){for(NSString *role in @[@"node",@"controller",@"entryHelper",@"coreHelper"]){NSDictionary *entry=value[role];BOOL executable=![role isEqual:@"controller"];uint64_t maximum=[role isEqual:@"node"]?256ULL*1024*1024:executable?16ULL*1024*1024:4ULL*1024*1024;
    if(!matches(root,contents,entry[@"path"],entry[@"sha256"],maximum,executable,NULL,NULL,failure)){ok=NO;break;}
  }}
  NSMutableSet *expectedFiles=[NSMutableSet set];uint64_t total=0;
  if(ok){for(NSDictionary *entry in value[@"closure"]){uint64_t length=0;if(!matches(root,contents,entry[@"path"],entry[@"sha256"],4ULL*1024*1024,NO,NULL,&length,failure)){ok=NO;break;}total+=length;if(total>64ULL*1024*1024){*failure=@"SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY";ok=NO;break;}[expectedFiles addObject:entry[@"path"]];}}
  if(ok){*failure=@"SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY";int dir=openRelative(root,contents,@"Resources/runtime",YES);NSMutableSet *files=[NSMutableSet set];NSUInteger count=0;ok=dir>=0 && inventory(dir,contents,@"Resources/runtime",0,&count,files) && [files isEqualToSet:expectedFiles];if(dir>=0)close(dir);}
  if(ok)ok=fstat(root,&after)==0 && same(before,after) && location(root,contents);close(root);if(!ok)return nil;
  NSMutableDictionary *config=[@{@"contents":contents,@"sourceApp":[contents stringByAppendingPathComponent:value[@"payload"][@"path"]],@"receiptPath":[contents stringByAppendingPathComponent:value[@"payload"][@"receipt"][@"path"]],@"receiptSha256":value[@"payload"][@"receipt"][@"sha256"],@"programSha256":value[@"payload"][@"programSha256"],@"bootstrapSha256":value[@"payload"][@"bootstrapSha256"]} mutableCopy];
  for(NSString *role in rolePaths())config[role]=@{@"path":[contents stringByAppendingPathComponent:value[role][@"path"]],@"sha256":value[role][@"sha256"]};
  return [config copy];
}
#endif
NSDictionary *SEPInstallerVerifyMainBundle(int argc, NSString **failure) {
  NSString *__autoreleasing ignored=nil;if(!failure)failure=&ignored;
#ifdef SEP_INSTALLER_MANIFEST_SHA256
  if(argc!=1){*failure=@"SEP_INSTALLER_ADMISSION_ARGUMENT";return nil;}
  NSString *expected=@SEP_INSTALLER_MANIFEST_SHA256;if(!hexHash(expected)){*failure=@"SEP_INSTALLER_ADMISSION_MANIFEST_CHANGED";return nil;}
  return verifyBundle(NSBundle.mainBundle,expected,failure);
#else
  (void)argc;*failure=@"SEP_INSTALLER_ADMISSION_MANIFEST_CHANGED";
  return nil;
#endif
}
