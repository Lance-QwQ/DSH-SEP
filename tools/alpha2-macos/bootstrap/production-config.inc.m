/* Included only by the non-test build. It never evaluates environment paths,
 * external descriptors or controller arguments. Same-UID program mutation is
 * outside the trusted installation boundary; this is not an executable lease. */
#include <dirent.h>
#ifdef SEP_BOOTSTRAP_MANIFEST_SHA256
static BOOL pExact(id v,NSArray *keys) {
  return [v isKindOfClass:NSDictionary.class] && [[NSSet setWithArray:[v allKeys]] isEqualToSet:[NSSet setWithArray:keys]];
}
static BOOL pHash(id v) {
  return [v isKindOfClass:NSString.class] && [v length]==64 && [v rangeOfCharacterFromSet:[[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet]].location==NSNotFound;
}
static BOOL sepBootstrapRelativePath(NSString *v) {
  if(![v isKindOfClass:NSString.class] || !v.length || v.length>1024) return NO;
  for(NSUInteger i=0;i<v.length;i++){unichar c=[v characterAtIndex:i];if(c<32 || c>126 || c=='\\' || c==':')return NO;}
  for(NSString *part in [v componentsSeparatedByString:@"/"])if(!part.length || [part isEqual:@"."] || [part isEqual:@".."] || [part hasSuffix:@"."] || [part hasSuffix:@" "])return NO;
  return YES;
}
static BOOL pRuntimePath(NSString *path) {
  if(!sepBootstrapRelativePath(path) || ![path hasPrefix:@"Resources/product/runtime/"])return NO;
  for(NSString *p in [path componentsSeparatedByString:@"/"]){NSString *s=p.lowercaseString;if([s isEqual:@"test"] || [s isEqual:@"tests"] || [s hasPrefix:@"fixture-"] || [s hasPrefix:@"fixture."] || [s containsString:@".test."])return NO;}
  return YES;
}
static BOOL pItem(id value) { return pExact(value,@[@"path",@"sha256"]) && sepBootstrapRelativePath(value[@"path"]) && pHash(value[@"sha256"]); }
static BOOL pShape(id v) {
  if(!pExact(v,@[@"schema",@"layout",@"program",@"node",@"controller",@"closure"]) || ![v[@"schema"] isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)v[@"schema"])==CFBooleanGetTypeID() || ![v[@"schema"] isEqual:@1] || ![v[@"layout"] isEqual:@"macos-app-v1"])return NO;
  NSDictionary *paths=@{@"program":@"Resources/PROGRAM.json",@"node":@"Helpers/DSH SEP Desktop.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node",@"controller":@"Resources/product/runtime/bootstrap/controller.mjs"};
  for(NSString *role in paths)if(!pItem(v[role]) || ![v[role][@"path"] isEqual:paths[role]])return NO;
  id closure=v[@"closure"];if(![closure isKindOfClass:NSArray.class] || [closure count]==0 || [closure count]>1024)return NO;
  NSMutableSet *seen=[NSMutableSet set];NSString *previous=@"";BOOL controller=NO;
  for(id item in closure){
    if(!pItem(item) || !pRuntimePath(item[@"path"]))return NO;NSString *path=item[@"path"];
    if([path compare:previous options:NSLiteralSearch]!=NSOrderedDescending || [seen containsObject:path.lowercaseString])return NO;
    previous=path;[seen addObject:path.lowercaseString];
    if([path isEqual:paths[@"controller"]]){if(![item[@"sha256"] isEqual:v[@"controller"][@"sha256"]])return NO;controller=YES;}
  }
  return controller;
}
static BOOL pSafe(struct stat s,BOOL directory) {
  return (directory?S_ISDIR(s.st_mode):(S_ISREG(s.st_mode) && s.st_nlink==1)) && (s.st_uid==geteuid() || s.st_uid==0) && !(s.st_mode&0022);
}
static BOOL pSame(struct stat a,struct stat b) {
  return a.st_dev==b.st_dev && a.st_ino==b.st_ino && a.st_mode==b.st_mode && a.st_uid==b.st_uid && a.st_gid==b.st_gid && a.st_nlink==b.st_nlink && a.st_size==b.st_size && a.st_mtimespec.tv_sec==b.st_mtimespec.tv_sec && a.st_mtimespec.tv_nsec==b.st_mtimespec.tv_nsec && a.st_ctimespec.tv_sec==b.st_ctimespec.tv_sec && a.st_ctimespec.tv_nsec==b.st_ctimespec.tv_nsec;
}
static BOOL pLocation(int fd,NSString *path) {
  char bytes[PATH_MAX];if(fcntl(fd,F_GETPATH,bytes))return NO;NSString *actual=[NSString stringWithUTF8String:bytes];return actual && [actual isEqual:path];
}
static int pOpen(int root,NSString *contents,NSString *relative,BOOL directory) {
  if(!sepBootstrapRelativePath(relative))return -1;int fd=fcntl(root,F_DUPFD_CLOEXEC,10);if(fd<0)return -1;
  NSArray *parts=[relative componentsSeparatedByString:@"/"];NSString *path=contents;
  for(NSUInteger i=0;i<parts.count;i++){
    BOOL dir=i+1<parts.count || directory;NSString *part=parts[i];int next=openat(fd,part.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW|O_CLOEXEC|(dir?O_DIRECTORY:0));close(fd);fd=next;if(fd<0)return -1;
    path=[path stringByAppendingPathComponent:part];struct stat s;if(fstat(fd,&s) || !pSafe(s,dir) || !pLocation(fd,path)){close(fd);return -1;}
  }
  return fd;
}
static BOOL pRead(int root,NSString *contents,NSString *relative,uint64_t maximum,BOOL executable,NSData **data,NSString **digest,uint64_t *length) {
  int fd=pOpen(root,contents,relative,NO);if(fd<0)return NO;struct stat before,after;
  BOOL ok=fstat(fd,&before)==0 && before.st_size>=0 && (uint64_t)before.st_size<=maximum && (!executable || (before.st_mode&0111));
  CC_SHA256_CTX state;CC_SHA256_Init(&state);NSMutableData *buffer=data?[NSMutableData data]:nil;uint64_t total=0;
  while(ok){unsigned char bytes[65536];ssize_t n=read(fd,bytes,sizeof bytes);if(n<0 && errno==EINTR)continue;if(n<0){ok=NO;break;}if(!n)break;total+=(uint64_t)n;if(total>maximum){ok=NO;break;}CC_SHA256_Update(&state,bytes,(CC_LONG)n);[buffer appendBytes:bytes length:(NSUInteger)n];}
  ok=ok && fstat(fd,&after)==0 && pSame(before,after) && total==(uint64_t)before.st_size && pLocation(fd,[contents stringByAppendingPathComponent:relative]);
  // Re-open from the retained root to detect parent directory substitution.
  int check=ok?pOpen(root,contents,relative,NO):-1;if(check>=0){ok=fstat(check,&after)==0 && pSame(before,after);close(check);}else ok=NO;
  close(fd);unsigned char bytes[CC_SHA256_DIGEST_LENGTH];CC_SHA256_Final(bytes,&state);if(!ok)return NO;
  NSMutableString *hex=[NSMutableString stringWithCapacity:64];for(size_t i=0;i<sizeof bytes;i++)[hex appendFormat:@"%02x",bytes[i]];
  if(data)*data=buffer;if(digest)*digest=hex;if(length)*length=total;return YES;
}
static BOOL pInventory(int dir,NSString *contents,NSString *relative,NSUInteger depth,NSUInteger *count,NSMutableSet *files) {
  if(depth>32 || !pLocation(dir,[contents stringByAppendingPathComponent:relative]))return NO;
  struct stat before,after;if(fstat(dir,&before) || !pSafe(before,YES))return NO;
  int copy=fcntl(dir,F_DUPFD_CLOEXEC,10);if(copy<0)return NO;DIR *stream=fdopendir(copy);if(!stream){close(copy);return NO;}BOOL ok=YES;
  for(;;){errno=0;struct dirent *entry=readdir(stream);if(!entry){if(errno)ok=NO;break;}if(!strcmp(entry->d_name,".") || !strcmp(entry->d_name,".."))continue;
    if(++*count>2048){ok=NO;break;}NSString *name=[NSString stringWithUTF8String:entry->d_name];if(!name){ok=NO;break;}NSString *path=[relative stringByAppendingPathComponent:name];
    if(!pRuntimePath(path)){ok=NO;break;}struct stat info;if(fstatat(dir,entry->d_name,&info,AT_SYMLINK_NOFOLLOW)){ok=NO;break;}
    if(S_ISDIR(info.st_mode)){int child=openat(dir,entry->d_name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(child<0){ok=NO;break;}struct stat held;ok=fstat(child,&held)==0 && pSame(info,held) && pInventory(child,contents,path,depth+1,count,files);close(child);if(!ok)break;}
    else if(pSafe(info,NO)){if(files.count>=1024 || [files containsObject:path]){ok=NO;break;}[files addObject:path];}
    else {ok=NO;break;}
  }
  closedir(stream);return ok && fstat(dir,&after)==0 && pSame(before,after) && pLocation(dir,[contents stringByAppendingPathComponent:relative]);
}
static NSDictionary *pVerifyBundle(NSBundle *bundle,NSString *expected,NSString **failure) {
  *failure=@"SEP_BOOTSTRAP_BUNDLE_PATH";NSString *app=bundle.bundlePath;
  if(![app hasSuffix:@".app"])return nil;NSString *contents=[app stringByAppendingPathComponent:@"Contents"],*binary=[contents stringByAppendingPathComponent:@"MacOS/DSH SEP"];
  if(![bundle.executablePath isEqual:binary])return nil;char canonical[PATH_MAX];if(!realpath(contents.fileSystemRepresentation,canonical) || strcmp(canonical,contents.fileSystemRepresentation))return nil;
  int root=open(contents.fileSystemRepresentation,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(root<0)return nil;struct stat before,after;BOOL ok=fstat(root,&before)==0 && pSafe(before,YES) && pLocation(root,contents);NSDictionary *value=nil;NSData *manifest=nil;NSString *actual=nil;
  *failure=@"SEP_BOOTSTRAP_RESOURCE_IDENTITY";
  if(ok)ok=pRead(root,contents,@"Resources/BOOTSTRAP.json",256ULL*1024,NO,&manifest,&actual,NULL);
  if(ok && ![actual isEqual:expected]){*failure=@"SEP_BOOTSTRAP_MANIFEST_CHANGED";ok=NO;}
  if(ok){value=[NSJSONSerialization JSONObjectWithData:manifest options:0 error:NULL];if(!pShape(value)){*failure=@"SEP_BOOTSTRAP_MANIFEST";ok=NO;}}
  if(ok){for(NSString *role in @[@"program",@"node",@"controller"]){NSDictionary *e=value[role];*failure=@"SEP_BOOTSTRAP_RESOURCE_IDENTITY";if(!pRead(root,contents,e[@"path"],[role isEqual:@"node"]?256ULL*1024*1024:[role isEqual:@"program"]?256ULL*1024:4ULL*1024*1024,[role isEqual:@"node"],NULL,&actual,NULL)){ok=NO;break;}if(![actual isEqual:e[@"sha256"]]){*failure=@"SEP_BOOTSTRAP_RESOURCE_CHANGED";ok=NO;break;}}}
  NSMutableSet *expectedFiles=[NSMutableSet set];uint64_t total=0;
  if(ok){for(NSDictionary *e in value[@"closure"]){uint64_t length=0;*failure=@"SEP_BOOTSTRAP_RESOURCE_IDENTITY";if(!pRead(root,contents,e[@"path"],4ULL*1024*1024,NO,NULL,&actual,&length)){ok=NO;break;}if(![actual isEqual:e[@"sha256"]]){*failure=@"SEP_BOOTSTRAP_RESOURCE_CHANGED";ok=NO;break;}total+=length;if(total>64ULL*1024*1024){ok=NO;break;}[expectedFiles addObject:e[@"path"]];}}
  if(ok){*failure=@"SEP_BOOTSTRAP_RESOURCE_IDENTITY";int dir=pOpen(root,contents,@"Resources/product/runtime",YES);NSMutableSet *files=[NSMutableSet set];NSUInteger count=0;ok=dir>=0 && pInventory(dir,contents,@"Resources/product/runtime",0,&count,files) && [files isEqualToSet:expectedFiles];if(dir>=0)close(dir);}
  if(ok)ok=fstat(root,&after)==0 && pSame(before,after) && pLocation(root,contents);close(root);if(!ok)return nil;
  return @{@"contents":contents,@"node":[contents stringByAppendingPathComponent:value[@"node"][@"path"]],@"controller":[contents stringByAppendingPathComponent:value[@"controller"][@"path"]],@"programSha256":value[@"program"][@"sha256"]};
}
#endif
static int pProductionMain(int argc) {
#ifdef SEP_BOOTSTRAP_MANIFEST_SHA256
  NSString *expected=@SEP_BOOTSTRAP_MANIFEST_SHA256,*failure=nil;NSDictionary *config=nil;
  if(argc!=1)failure=@"SEP_BOOTSTRAP_PRODUCTION_ARGUMENTS";
  else if(!pHash(expected))failure=@"SEP_BOOTSTRAP_MANIFEST_CHANGED";
  else config=pVerifyBundle(NSBundle.mainBundle,expected,&failure);
  NSMutableDictionary *receipt=[@{@"status":@"blocked",@"resourcesConfirmedReleased":@NO,@"code":config?@"SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED":failure?:@"SEP_BOOTSTRAP_RESOURCE_IDENTITY"} mutableCopy];
  if(config)receipt[@"manifestVerified"]=@YES;NSData *data=[NSJSONSerialization dataWithJSONObject:receipt options:0 error:NULL];if(data)fwrite(data.bytes,1,data.length,stdout);fputc('\n',stdout);return 78;
#else
  (void)argc;puts("{\"status\":\"blocked\",\"code\":\"SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED\",\"resourcesConfirmedReleased\":false}");return 78;
#endif
}
