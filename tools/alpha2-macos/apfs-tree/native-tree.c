#define _GNU_SOURCE
#define _DARWIN_C_SOURCE
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/file.h>
#ifdef __APPLE__
#include <sys/mount.h>
#else
#include <sys/vfs.h>
#endif
#include <fcntl.h>
#include <dirent.h>
#include <unistd.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>

/* Production builds are Darwin/APFS only. The explicit Linux test build only
 * exercises shared POSIX traversal; it must never ship as a Mac helper. */
#define ENTRY_LIMIT 1024
#define FILE_LIMIT 4194304
#define BYTE_LIMIT 33554432
#define DEPTH_LIMIT 16
#define PATH_LIMIT 4096
typedef struct { char path[PATH_LIMIT]; struct stat st; int directory; } Row;
typedef struct { Row rows[ENTRY_LIMIT+1]; size_t length; uint64_t bytes; } Snapshot;
static Snapshot source_snapshot, destination_snapshot;
static dev_t source_device, destination_device;
static void die(const char *code) { fprintf(stderr,"%s\n",code); exit(70); }
static void timed_out(int sig) { (void)sig; static const char m[]="SEP_PROJECT_DEADLINE\n"; (void)write(2,m,sizeof(m)-1); _exit(70); }
static void checked(int condition,const char *code) { if(!condition)die(code); }
static void getstat(int fd, struct stat *st) { if(fstat(fd,st))die("SEP_PROJECT_TREE_CHANGED"); }
static int identity(const struct stat *a,const struct stat *b) { return a->st_dev==b->st_dev&&a->st_ino==b->st_ino; }
#ifdef __APPLE__
#define MT(s) ((s)->st_mtimespec)
#define CT(s) ((s)->st_ctimespec)
#else
#define MT(s) ((s)->st_mtim)
#define CT(s) ((s)->st_ctim)
#endif
static int version(const struct stat *a,const struct stat *b) {
 return identity(a,b)&&a->st_size==b->st_size&&a->st_mode==b->st_mode&&a->st_nlink==b->st_nlink&&a->st_uid==b->st_uid&&
 MT(a).tv_sec==MT(b).tv_sec&&MT(a).tv_nsec==MT(b).tv_nsec&&CT(a).tv_sec==CT(b).tv_sec&&CT(a).tv_nsec==CT(b).tv_nsec;
}
static void filesystem(int fd) {
 struct statfs fs; checked(fstatfs(fd,&fs)==0,"SEP_PROJECT_PATH");
#ifdef __APPLE__
 checked(!strcmp(fs.f_fstypename,"apfs")&&(fs.f_flags&MNT_LOCAL),"SEP_PROJECT_FILESYSTEM");
#elif defined(SEP_POSIX_TEST)
 checked(fs.f_type==0xef53,"SEP_PROJECT_TEST_FILESYSTEM");
#else
 die("SEP_PROJECT_PLATFORM");
#endif
}
static int safe_utf8(const unsigned char *s,size_t n) {
 for(size_t i=0;i<n;) {
  uint32_t cp=s[i++]; if(cp<0x80){if(cp<32||cp==127)return 0;continue;}
  size_t more;uint32_t min;
  if(cp>=0xc2&&cp<=0xdf){more=1;cp&=31;min=0x80;}
  else if(cp>=0xe0&&cp<=0xef){more=2;cp&=15;min=0x800;}
  else if(cp>=0xf0&&cp<=0xf4){more=3;cp&=7;min=0x10000;}
  else return 0;
  if(i+more>n)return 0;
  while(more--){if((s[i]&0xc0)!=0x80)return 0;cp=(cp<<6)|(s[i++]&63);}
  if(cp<min||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))return 0;
 }
 return 1;
}
static void path_shape(const char *path) {
 size_t n=strlen(path);checked(n>1&&n<PATH_LIMIT&&path[0]=='/'&&path[n-1]!='/'&&safe_utf8((const unsigned char*)path,n),"SEP_PROJECT_PATH");
 checked(!strstr(path,"//"),"SEP_PROJECT_PATH");
}
static int root_open(const char *path,int private_root) {
 path_shape(path); char copy[PATH_LIMIT];strcpy(copy,path);int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
 checked(fd>=0,"SEP_PROJECT_PATH");char *save=NULL;
 for(char *part=strtok_r(copy+1,"/",&save);part;part=strtok_r(NULL,"/",&save)) {
  checked(strcmp(part,".")&&strcmp(part,".."),"SEP_PROJECT_PATH");struct stat before,after;
  checked(fstatat(fd,part,&before,AT_SYMLINK_NOFOLLOW)==0&&S_ISDIR(before.st_mode),"SEP_PROJECT_PATH");
  int next=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);checked(next>=0,"SEP_PROJECT_PATH");getstat(next,&after);
  checked(identity(&before,&after),"SEP_PROJECT_TREE_CHANGED");close(fd);fd=next;
 }
 struct stat st;getstat(fd,&st);checked(st.st_uid==geteuid()&&st.st_ino&&(!private_root||(st.st_mode&077)==0),"SEP_PROJECT_PATH");filesystem(fd);return fd;
}
static void root_still_bound(int fd,const char *path) {
 int current=root_open(path,0);struct stat a,b;getstat(fd,&a);getstat(current,&b);close(current);checked(identity(&a,&b),"SEP_PROJECT_TREE_CHANGED");
}
static void durable(int fd) {
 checked(fsync(fd)==0,"SEP_PROJECT_SYNC");
#ifdef __APPLE__
 struct stat st;getstat(fd,&st);if(S_ISREG(st.st_mode))checked(fcntl(fd,F_FULLFSYNC)==0,"SEP_PROJECT_SYNC");
#endif
}
static void hex(const void *data,size_t n) {const unsigned char *p=data;static const char digits[]="0123456789abcdef";for(size_t i=0;i<n;i++){putchar(digits[p[i]>>4]);putchar(digits[p[i]&15]);}}
static void emit_version(const struct stat *st) {
 printf("%llu:%llu:%lld:%lld%09ld:%lld%09ld:%llu:%llu",(unsigned long long)st->st_dev,(unsigned long long)st->st_ino,(long long)st->st_size,
 (long long)MT(st).tv_sec,MT(st).tv_nsec,(long long)CT(st).tv_sec,CT(st).tv_nsec,(unsigned long long)st->st_mode,(unsigned long long)st->st_nlink);
}
static void version_text(const struct stat *st,char *out,size_t length) {
 int n=snprintf(out,length,"%llu:%llu:%lld:%lld%09ld:%lld%09ld:%llu:%llu",(unsigned long long)st->st_dev,(unsigned long long)st->st_ino,(long long)st->st_size,
 (long long)MT(st).tv_sec,MT(st).tv_nsec,(long long)CT(st).tv_sec,CT(st).tv_nsec,(unsigned long long)st->st_mode,(unsigned long long)st->st_nlink);
 checked(n>0&&(size_t)n<length,"SEP_PROJECT_LIMIT");
}
static void emit_row(const char *path,const struct stat *st,const unsigned char *body,size_t size,int directory) {
 printf("{\"kind\":\"%s\",\"pathHex\":\"",directory?"directory":"file");hex(path,strlen(path));printf("\",\"version\":\"");emit_version(st);printf("\"");
 if(!directory){printf(",\"size\":%zu,\"executable\":%s,\"dataHex\":\"",size,(st->st_mode&0100)?"true":"false");hex(body,size);printf("\"");}
 printf("}\n");
}
static int name_order(const void *a,const void *b){return strcmp(*(const char *const*)a,*(const char *const*)b);}
static char **names(int fd,size_t *count) {
 int fresh=openat(fd,".",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);checked(fresh>=0,"SEP_PROJECT_TREE_CHANGED");DIR *d=fdopendir(fresh);checked(d!=NULL,"SEP_PROJECT_IO");
 char **out=calloc(ENTRY_LIMIT+1,sizeof(char*));checked(out!=NULL,"SEP_PROJECT_MEMORY");*count=0;errno=0;struct dirent *entry;
 while((entry=readdir(d))) {
  if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;
  size_t n=strlen(entry->d_name);checked(n>0&&n<=200&&safe_utf8((unsigned char*)entry->d_name,n),"SEP_PROJECT_UNSAFE_TREE");
  checked(*count<ENTRY_LIMIT,"SEP_PROJECT_LIMIT");out[(*count)++]=strdup(entry->d_name);checked(out[*count-1]!=NULL,"SEP_PROJECT_MEMORY");errno=0;
 }
 checked(errno==0,"SEP_PROJECT_IO");closedir(d);qsort(out,*count,sizeof(char*),name_order);return out;
}
static void put_row(Snapshot *snapshot,const char *path,const struct stat *st,int directory) {
 checked(snapshot->length<ENTRY_LIMIT+1,"SEP_PROJECT_LIMIT");Row *r=&snapshot->rows[snapshot->length++];strcpy(r->path,path);r->st=*st;r->directory=directory;
}
static void check_row(const Snapshot *snapshot,size_t *index,const char *path,const struct stat *st,int directory) {
 checked(*index<snapshot->length,"SEP_PROJECT_TREE_CHANGED");const Row *r=&snapshot->rows[(*index)++];checked(!strcmp(path,r->path)&&r->directory==directory&&version(st,&r->st),"SEP_PROJECT_TREE_CHANGED");
}
static void walk(int dir,int destination,const char *prefix,unsigned depth,Snapshot *snapshot,int verify,size_t *index,dev_t device) {
 checked(depth<=DEPTH_LIMIT,"SEP_PROJECT_LIMIT");struct stat before,after;getstat(dir,&before);
 checked(S_ISDIR(before.st_mode)&&before.st_uid==geteuid()&&before.st_dev==device,"SEP_PROJECT_UNSAFE_TREE");
 if(verify)check_row(snapshot,index,prefix,&before,1);else put_row(snapshot,prefix,&before,1);
 size_t dest_slot=destination_snapshot.length;
 if(destination>=0){struct stat d;getstat(destination,&d);put_row(&destination_snapshot,prefix,&d,1);}
 size_t count;char **children=names(dir,&count);
 for(size_t i=0;i<count;i++) {
  char rel[PATH_LIMIT];int size=snprintf(rel,sizeof(rel),"%s%s%s",prefix,*prefix?"/":"",children[i]);checked(size>0&&size<PATH_LIMIT,"SEP_PROJECT_LIMIT");
  struct stat st,opened;checked(fstatat(dir,children[i],&st,AT_SYMLINK_NOFOLLOW)==0,"SEP_PROJECT_TREE_CHANGED");
  checked(st.st_uid==geteuid()&&st.st_ino&&st.st_dev==device&&(S_ISREG(st.st_mode)||S_ISDIR(st.st_mode)),"SEP_PROJECT_UNSAFE_TREE");
  if(S_ISDIR(st.st_mode)) {
   int fd=openat(dir,children[i],O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);checked(fd>=0,"SEP_PROJECT_TREE_CHANGED");getstat(fd,&opened);checked(version(&st,&opened),"SEP_PROJECT_TREE_CHANGED");
   int out=-1;if(destination>=0){checked(mkdirat(destination,children[i],0700)==0,"SEP_PROJECT_UNSAFE_TREE");out=openat(destination,children[i],O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);checked(out>=0,"SEP_PROJECT_TREE_CHANGED");}
   if(!verify)emit_row(rel,&st,NULL,0,1);
   walk(fd,out,rel,depth+1,snapshot,verify,index,device);struct stat linked;checked(fstatat(dir,children[i],&linked,AT_SYMLINK_NOFOLLOW)==0&&version(&st,&linked),"SEP_PROJECT_TREE_CHANGED");close(fd);if(out>=0)close(out);
  }else{
   checked(st.st_nlink==1,"SEP_PROJECT_UNSAFE_TREE");checked(st.st_size>=0&&st.st_size<=FILE_LIMIT&&snapshot->bytes+(uint64_t)st.st_size<=BYTE_LIMIT,"SEP_PROJECT_LIMIT");
   if(verify){check_row(snapshot,index,rel,&st,0);continue;}
   snapshot->bytes+=(uint64_t)st.st_size;int fd=openat(dir,children[i],O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);checked(fd>=0,"SEP_PROJECT_TREE_CHANGED");getstat(fd,&opened);checked(version(&st,&opened),"SEP_PROJECT_TREE_CHANGED");
   size_t expected=(size_t)st.st_size,offset=0;unsigned char *data=malloc(expected+1);checked(data!=NULL,"SEP_PROJECT_MEMORY");
   while(offset<expected+1){ssize_t n=read(fd,data+offset,expected+1-offset);if(n<0&&errno==EINTR)continue;checked(n>=0,"SEP_PROJECT_IO");if(!n)break;offset+=(size_t)n;}
   getstat(fd,&opened);checked(offset==expected&&version(&st,&opened),"SEP_PROJECT_TREE_CHANGED");struct stat linked;checked(fstatat(dir,children[i],&linked,AT_SYMLINK_NOFOLLOW)==0&&version(&st,&linked),"SEP_PROJECT_TREE_CHANGED");close(fd);
   put_row(snapshot,rel,&st,0);emit_row(rel,&st,data,offset,0);
   if(destination>=0){int out=openat(destination,children[i],O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,(st.st_mode&0100)?0700:0600);checked(out>=0,"SEP_PROJECT_UNSAFE_TREE");size_t written=0;while(written<offset){ssize_t n=write(out,data+written,offset-written);if(n<0&&errno==EINTR)continue;checked(n>0,"SEP_PROJECT_IO");written+=(size_t)n;}durable(out);getstat(out,&opened);checked(opened.st_nlink==1&&opened.st_uid==geteuid()&&opened.st_dev==destination_device,"SEP_PROJECT_TREE_CHANGED");put_row(&destination_snapshot,rel,&opened,0);close(out);}
   free(data);
  }
 }
 for(size_t i=0;i<count;i++)free(children[i]);
 free(children);getstat(dir,&after);checked(version(&before,&after),"SEP_PROJECT_TREE_CHANGED");
 if(destination>=0){durable(destination);getstat(destination,&destination_snapshot.rows[dest_slot].st);}
}
static void command(char *out,size_t capacity) { checked(fgets(out,(int)capacity,stdin)!=NULL,"SEP_PROJECT_PROTOCOL");checked(strchr(out,'\n')!=NULL,"SEP_PROJECT_PROTOCOL"); }
static void emit_directory(int fd) {struct stat st;getstat(fd,&st);printf("{\"kind\":\"directory\",\"dev\":\"%llu\",\"ino\":\"%llu\",\"mode\":\"%llu\",\"uid\":\"%llu\"}\n",(unsigned long long)st.st_dev,(unsigned long long)st.st_ino,(unsigned long long)st.st_mode,(unsigned long long)st.st_uid);fflush(stdout);}
static int transaction_lock(void) {
 const char *path=getenv("SEP_PROJECT_NATIVE_LOCK");if(!path)return -1;path_shape(path);char parent[PATH_LIMIT];strcpy(parent,path);char *base=strrchr(parent,'/');checked(base&&base!=parent,"SEP_PROJECT_PATH");*base++=0;
 checked(strcmp(base,".")&&strcmp(base,".."),"SEP_PROJECT_PATH");int dir=root_open(parent,1),fd=openat(dir,base,O_RDWR|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
 if(fd<0&&errno==EEXIST)fd=openat(dir,base,O_RDWR|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC);
 checked(fd>=0,"SEP_PROJECT_NATIVE_LOCK");struct stat st,linked;getstat(fd,&st);
 checked(S_ISREG(st.st_mode)&&st.st_nlink==1&&st.st_uid==geteuid()&&(st.st_mode&077)==0,"SEP_PROJECT_NATIVE_LOCK");
 checked(flock(fd,LOCK_EX|LOCK_NB)==0,"SEP_PROJECT_BUSY");checked(fstatat(dir,base,&linked,AT_SYMLINK_NOFOLLOW)==0&&identity(&st,&linked),"SEP_PROJECT_NATIVE_LOCK");root_still_bound(dir,parent);close(dir);return fd;
}
static int temp_parent=-1;static char temp_name[64];static struct stat temp_identity;
static void cleanup_temp(void){if(temp_parent<0||!temp_name[0])return;struct stat st;if(fstatat(temp_parent,temp_name,&st,AT_SYMLINK_NOFOLLOW)==0&&identity(&st,&temp_identity)){(void)unlinkat(temp_parent,temp_name,0);(void)fsync(temp_parent);}}
static int nibble(char c){if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;return -1;}
static void apply_file(int source,const char *root,const char *relative,const char *expected,const char *action) {
 size_t length=strlen(relative);checked(length>0&&length<PATH_LIMIT&&relative[0]!='/'&&relative[length-1]!='/'&&!strstr(relative,"//")&&safe_utf8((const unsigned char*)relative,length),"SEP_PROJECT_PATH");
 checked(!strcmp(action,"write")||!strcmp(action,"delete"),"SEP_PROJECT_PROTOCOL");checked(strlen(expected)<256,"SEP_PROJECT_PROTOCOL");
 struct stat original_root;getstat(source,&original_root);checked((original_root.st_mode&077)==0,"SEP_PROJECT_PATH");
 int parent=dup(source);checked(parent>=0,"SEP_PROJECT_IO");char path[PATH_LIMIT];strcpy(path,relative);char *save=NULL,*base=strtok_r(path,"/",&save);
 while(1){checked(base&&strcmp(base,".")&&strcmp(base,"..")&&strlen(base)<=200,"SEP_PROJECT_PATH");char *next=strtok_r(NULL,"/",&save);if(!next)break;
  struct stat a,b;checked(fstatat(parent,base,&a,AT_SYMLINK_NOFOLLOW)==0&&S_ISDIR(a.st_mode)&&a.st_uid==geteuid()&&a.st_dev==source_device&&(a.st_mode&077)==0,"SEP_PROJECT_PATH");int fd=openat(parent,base,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);checked(fd>=0,"SEP_PROJECT_PATH");getstat(fd,&b);checked(identity(&a,&b),"SEP_PROJECT_TREE_CHANGED");close(parent);parent=fd;base=next;
 }
 struct stat before;int exists=fstatat(parent,base,&before,AT_SYMLINK_NOFOLLOW)==0;if(!exists)checked(errno==ENOENT,"SEP_PROJECT_PATH");
 int absent=!strcmp(expected,"absent");if(absent)checked(!exists&&!strcmp(action,"write"),"SEP_PROJECT_STALE_FILE");else{
  checked(exists&&S_ISREG(before.st_mode)&&before.st_nlink==1&&before.st_uid==geteuid()&&before.st_dev==source_device,"SEP_PROJECT_STALE_FILE");char current[256];version_text(&before,current,sizeof(current));checked(!strcmp(current,expected),"SEP_PROJECT_STALE_FILE");
 }
 if(!strcmp(action,"delete")){root_still_bound(source,root);struct stat current;checked(fstatat(parent,base,&current,AT_SYMLINK_NOFOLLOW)==0&&version(&before,&current),"SEP_PROJECT_STALE_FILE");checked(unlinkat(parent,base,0)==0,"SEP_PROJECT_IO");durable(parent);close(parent);puts("{\"phase\":\"committed\"}");return;}
 char *line=malloc(FILE_LIMIT*2+2);checked(line!=NULL,"SEP_PROJECT_MEMORY");checked(fgets(line,FILE_LIMIT*2+2,stdin)!=NULL,"SEP_PROJECT_PROTOCOL");size_t n=strlen(line);checked(n>0&&line[n-1]=='\n'&&((n-1)%2)==0&&fgetc(stdin)==EOF,"SEP_PROJECT_PROTOCOL");size_t bytes=(n-1)/2;for(size_t i=0;i<bytes;i++){int a=nibble(line[i*2]),b=nibble(line[i*2+1]);checked(a>=0&&b>=0,"SEP_PROJECT_PROTOCOL");line[i]=(char)((a<<4)|b);}
 unsigned char random[16];int rng=open("/dev/urandom",O_RDONLY|O_CLOEXEC);checked(rng>=0&&read(rng,random,sizeof(random))==(ssize_t)sizeof(random),"SEP_PROJECT_IO");close(rng);strcpy(temp_name,".sep-write-");for(size_t i=0;i<sizeof(random);i++)snprintf(temp_name+11+i*2,3,"%02x",random[i]);
 int out=openat(parent,temp_name,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,(!absent&&(before.st_mode&0100))?0700:0600);checked(out>=0,"SEP_PROJECT_IO");getstat(out,&temp_identity);temp_parent=parent;atexit(cleanup_temp);
 size_t offset=0;while(offset<bytes){ssize_t wrote=write(out,line+offset,bytes-offset);if(wrote<0&&errno==EINTR)continue;checked(wrote>0,"SEP_PROJECT_IO");offset+=(size_t)wrote;}free(line);durable(out);close(out);root_still_bound(source,root);
 if(absent){checked(linkat(parent,temp_name,parent,base,0)==0,"SEP_PROJECT_STALE_FILE");durable(parent);checked(unlinkat(parent,temp_name,0)==0,"SEP_PROJECT_WRITE_UNCERTAIN");}
 else{struct stat current;checked(fstatat(parent,base,&current,AT_SYMLINK_NOFOLLOW)==0&&version(&before,&current),"SEP_PROJECT_STALE_FILE");checked(renameat(parent,temp_name,parent,base)==0,"SEP_PROJECT_IO");}
 temp_name[0]=0;durable(parent);close(parent);temp_parent=-1;puts("{\"phase\":\"committed\"}");
}
int main(int argc,char **argv) {
 signal(SIGALRM,timed_out);alarm(30);umask(077);checked(argc>=3&&argc<=6,"SEP_PROJECT_PROTOCOL");
 checked(!strcmp(argv[1],"tree")||!strcmp(argv[1],"hold")||!strcmp(argv[1],"sync")||!strcmp(argv[1],"apply"),"SEP_PROJECT_PROTOCOL");
 int lock=!strcmp(argv[1],"hold")?-1:transaction_lock();(void)lock;
 int source=root_open(argv[2],argc==4&&!strcmp(argv[1],"hold"));struct stat root;getstat(source,&root);source_device=root.st_dev;
 if(!strcmp(argv[1],"apply")){checked(argc==6,"SEP_PROJECT_PROTOCOL");apply_file(source,argv[2],argv[3],argv[4],argv[5]);close(source);return 0;}
 checked(argc<=4,"SEP_PROJECT_PROTOCOL");
 if(!strcmp(argv[1],"sync")){checked(argc==3,"SEP_PROJECT_PROTOCOL");root_still_bound(source,argv[2]);durable(source);close(source);puts("{\"phase\":\"committed\"}");return 0;}
 if(!strcmp(argv[1],"hold")) {
  checked(argc==3||(argc==4&&!strcmp(argv[3],"private")),"SEP_PROJECT_PROTOCOL");alarm(0);emit_directory(source);char line[32];
  while(fgets(line,sizeof(line),stdin)){alarm(10);root_still_bound(source,argv[2]);if(!strcmp(line,"close\n")){close(source);puts("{\"phase\":\"closed\"}");return 0;}checked(!strcmp(line,"stat\n")||!strcmp(line,"sync\n"),"SEP_PROJECT_PROTOCOL");if(!strcmp(line,"sync\n"))durable(source);emit_directory(source);alarm(0);}close(source);return 0;
 }
 int dest=-1;if(argc==4){size_t a=strlen(argv[2]),b=strlen(argv[3]);checked(!(a<=b&&!strncmp(argv[2],argv[3],a)&&(argv[3][a]=='/'||!argv[3][a])),"SEP_PROJECT_PATH");dest=root_open(argv[3],1);struct stat st;getstat(dest,&st);destination_device=st.st_dev;checked(!identity(&root,&st),"SEP_PROJECT_PATH");size_t n;char **items=names(dest,&n);checked(n==0,"SEP_PROJECT_UNSAFE_TREE");free(items);}
 size_t index=0;walk(source,dest,"",0,&source_snapshot,0,&index,source_device);
 printf("{\"phase\":\"prepared\",\"rootVersion\":\"");emit_version(&root);printf("\",\"bytes\":%llu}\n",(unsigned long long)source_snapshot.bytes);fflush(stdout);
 char line[32];command(line,sizeof(line));checked(!strcmp(line,"verify\n"),"SEP_PROJECT_PROTOCOL");
 root_still_bound(source,argv[2]);index=0;/* Second pass detects edits to files already read. */
 uint64_t saved=source_snapshot.bytes;source_snapshot.bytes=0;walk(source,-1,"",0,&source_snapshot,1,&index,source_device);source_snapshot.bytes=saved;checked(index==source_snapshot.length,"SEP_PROJECT_TREE_CHANGED");
 if(dest>=0){root_still_bound(dest,argv[3]);index=0;walk(dest,-1,"",0,&destination_snapshot,1,&index,destination_device);checked(index==destination_snapshot.length,"SEP_PROJECT_TREE_CHANGED");close(dest);}
 close(source);puts("{\"phase\":\"committed\"}");return 0;
}
