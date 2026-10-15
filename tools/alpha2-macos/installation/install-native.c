#define _DARWIN_C_SOURCE
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/file.h>
#include <sys/acl.h>
#include <copyfile.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* No children: this lease survives caller death until bounded work finishes. */
#define FRAME_MAX (2097152U)
#define FILE_MAX (2147483648LL)
#define TOTAL_MAX (8589934592LL)
static int parent_fd=-1,journal_fd=-1,lease_fd=-1;
static char parent_path[PATH_MAX],journal_name[96];
static struct stat parent_identity,journal_identity,lease_identity;
static uint64_t entries,total_bytes;
static void fail(const char *code){printf("ERR\t%s\n",code);fflush(stdout);exit(70);}
static void need(int condition,const char *code){if(!condition)fail(code);}
static int same_id(const struct stat *a,const struct stat *b){return a->st_dev==b->st_dev&&a->st_ino==b->st_ino;}
static int same_file(const struct stat *a,const struct stat *b){return same_id(a,b)&&a->st_size==b->st_size&&a->st_mode==b->st_mode&&a->st_nlink==b->st_nlink&&a->st_mtimespec.tv_sec==b->st_mtimespec.tv_sec&&a->st_mtimespec.tv_nsec==b->st_mtimespec.tv_nsec&&a->st_ctimespec.tv_sec==b->st_ctimespec.tv_sec&&a->st_ctimespec.tv_nsec==b->st_ctimespec.tv_nsec;}
static void id_string(const struct stat *s,char out[96]){snprintf(out,96,"%ju:%ju",(uintmax_t)s->st_dev,(uintmax_t)s->st_ino);}
static void full_sync(int fd){need(fsync(fd)==0&&fcntl(fd,F_FULLFSYNC)==0,"SEP_INSTALL_DURABILITY");}
static void dir_sync(int fd){need(fsync(fd)==0,"SEP_INSTALL_DURABILITY");}
static void no_acl(int fd){
 /* acl_get_fd_np conflates an absent FILESEC_ACL with stat/query errors.
  * Read the fd's security record first, then query property presence. */
 filesec_t security=filesec_init();need(security!=NULL,"SEP_INSTALL_ACL_READ");
 struct stat s;int present=0;
 if(fstatx_np(fd,&s,security)!=0||filesec_query_property(security,FILESEC_ACL,&present)!=0){filesec_free(security);fail("SEP_INSTALL_ACL_READ");}
 if(!present){filesec_free(security);return;}
 acl_t acl=NULL;int got=filesec_get_property(security,FILESEC_ACL,&acl);filesec_free(security);
 need(got==0&&acl!=NULL,"SEP_INSTALL_ACL_READ");
#ifdef _FILESEC_REMOVE_ACL
 need(acl!=(acl_t)_FILESEC_REMOVE_ACL,"SEP_INSTALL_ACL_READ");
#endif
 need(acl_valid(acl)==0,"SEP_INSTALL_ACL_INVALID");acl_entry_t entry;errno=0;
 int r=acl_get_entry(acl,ACL_FIRST_ENTRY,&entry),saved=errno;acl_free(acl);
 if(r==0)fail("SEP_INSTALL_ACL");
 need(r==-1&&saved==EINVAL,"SEP_INSTALL_ACL_ENUMERATION");
}
static int path_directory(const char *path){
 need(path&&path[0]=='/'&&strlen(path)<PATH_MAX&&path[1]&&path[strlen(path)-1]!='/',"SEP_INSTALL_PATH");
 char copy[PATH_MAX];strcpy(copy,path+1);int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);need(fd>=0,"SEP_INSTALL_PATH");
 char *cursor=copy,*part;
 while((part=strsep(&cursor,"/"))!=NULL){need(*part&&strcmp(part,".")&&strcmp(part,".."),"SEP_INSTALL_PATH");for(const unsigned char *p=(unsigned char*)part;*p;p++)need(*p>=32&&*p!=127&&*p!='\\',"SEP_INSTALL_PATH");int next=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);need(next>=0,"SEP_INSTALL_PATH");fd=next;}
 struct stat s;struct statfs fs;need(fstat(fd,&s)==0&&S_ISDIR(s.st_mode),"SEP_INSTALL_PATH");need(fstatfs(fd,&fs)==0&&!strcmp(fs.f_fstypename,"apfs"),"SEP_INSTALL_FILESYSTEM");return fd;
}
static void check_parent(void){int fd=path_directory(parent_path);struct stat s;need(fstat(fd,&s)==0&&same_id(&s,&parent_identity),"SEP_INSTALL_PATH_CHANGED");close(fd);need(fstatat(parent_fd,".dsh-sep-install.lock",&s,AT_SYMLINK_NOFOLLOW)==0&&same_id(&s,&lease_identity)&&S_ISREG(s.st_mode)&&s.st_nlink==1&&s.st_uid==geteuid()&&(s.st_mode&0777)==0600,"SEP_INSTALL_LEASE");if(journal_fd>=0){need(fstatat(parent_fd,journal_name,&s,AT_SYMLINK_NOFOLLOW)==0&&same_id(&s,&journal_identity)&&S_ISDIR(s.st_mode)&&s.st_uid==geteuid()&&(s.st_mode&0777)==0700,"SEP_INSTALL_JOURNAL");}}
static int hx(int c){if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;return -1;}
static char *unhex(const char *s,size_t *length){size_t n=strlen(s);need(n%2==0&&n<=FRAME_MAX,"SEP_INSTALL_PROTOCOL");char *v=malloc(n/2+1);need(v!=NULL,"SEP_INSTALL_MEMORY");for(size_t i=0;i<n;i+=2){int a=hx(s[i]),b=hx(s[i+1]);need(a>=0&&b>=0,"SEP_INSTALL_PROTOCOL");v[i/2]=(char)(a*16+b);}v[n/2]=0;*length=n/2;return v;}
static void hexout(const unsigned char *p,size_t n){const char *h="0123456789abcdef";for(size_t i=0;i<n;i++){putchar(h[p[i]>>4]);putchar(h[p[i]&15]);}}
static void write_all(int fd,const void *data,size_t size){const unsigned char *p=data;while(size){ssize_t n=write(fd,p,size);if(n<0&&errno==EINTR)continue;need(n>0,"SEP_INSTALL_WRITE");p+=n;size-=(size_t)n;}}
static void regular_private(int fd){struct stat s;need(fstat(fd,&s)==0&&S_ISREG(s.st_mode)&&s.st_nlink==1&&s.st_uid==geteuid()&&(s.st_mode&0777)==0600,"SEP_INSTALL_JOURNAL");no_acl(fd);}
static void open_journal(int create){
 if(create)need(mkdirat(parent_fd,journal_name,0700)==0,"SEP_INSTALL_JOURNAL_EXISTS");
 journal_fd=openat(parent_fd,journal_name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(journal_fd>=0,"SEP_INSTALL_JOURNAL");
 need(fstat(journal_fd,&journal_identity)==0&&journal_identity.st_uid==geteuid()&&(journal_identity.st_mode&0777)==0700,"SEP_INSTALL_JOURNAL");no_acl(journal_fd);dir_sync(parent_fd);
}
static void state_write(const char *hex){size_t n;char *bytes=unhex(hex,&n);need(n>0&&n<=1048576&&!memchr(bytes,0,n),"SEP_INSTALL_PROTOCOL");char temp[80];snprintf(temp,sizeof(temp),".state-%d-%08x",getpid(),arc4random());int fd=openat(journal_fd,temp,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);need(fd>=0,"SEP_INSTALL_JOURNAL");regular_private(fd);write_all(fd,bytes,n);free(bytes);full_sync(fd);close(fd);struct stat s;int r=fstatat(journal_fd,"state.json",&s,AT_SYMLINK_NOFOLLOW);need((r<0&&errno==ENOENT)||(r==0&&S_ISREG(s.st_mode)&&s.st_nlink==1&&s.st_uid==geteuid()&&(s.st_mode&0777)==0600),"SEP_INSTALL_JOURNAL");need(renameat(journal_fd,temp,journal_fd,"state.json")==0,"SEP_INSTALL_JOURNAL");dir_sync(journal_fd);}
static void name_check(const char *name){need(*name&&strcmp(name,".")&&strcmp(name,"..")&&strlen(name)<=NAME_MAX,"SEP_INSTALL_SOURCE_CHANGED");for(const unsigned char *p=(const unsigned char*)name;*p;p++)need(*p>=32&&*p!=127&&*p!='\\',"SEP_INSTALL_SOURCE_CHANGED");}
static void metadata(int src,int dst,mode_t mode,int directory){
 no_acl(src);need((mode&07000)==0&&(mode&0022)==0,"SEP_INSTALL_SOURCE_PERMISSIONS");
 need(fcopyfile(src,dst,NULL,COPYFILE_XATTR)==0,"SEP_INSTALL_METADATA");
 need(fchmod(dst,mode&0777)==0,"SEP_INSTALL_METADATA");if(directory)dir_sync(dst);else full_sync(dst);
}
static void copy_tree(int src,int dst,unsigned depth){
 need(depth<=64,"SEP_INSTALL_LIMIT");struct stat before,after;need(fstat(src,&before)==0,"SEP_INSTALL_SOURCE_CHANGED");
 DIR *dir=fdopendir(dup(src));need(dir!=NULL,"SEP_INSTALL_READ");struct dirent *de;
 errno=0;while((de=readdir(dir))!=NULL){const char *name=de->d_name;if(!strcmp(name,".")||!strcmp(name,".."))continue;name_check(name);need(++entries<=100000,"SEP_INSTALL_LIMIT");struct stat s,check;need(fstatat(src,name,&s,AT_SYMLINK_NOFOLLOW)==0,"SEP_INSTALL_SOURCE_CHANGED");
  if(S_ISDIR(s.st_mode)){
   int a=openat(src,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(a>=0&&fstat(a,&check)==0&&same_file(&s,&check),"SEP_INSTALL_SOURCE_CHANGED");need(mkdirat(dst,name,0700)==0,"SEP_INSTALL_WRITE");int b=openat(dst,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(b>=0,"SEP_INSTALL_WRITE");copy_tree(a,b,depth+1);close(b);close(a);
  }else if(S_ISREG(s.st_mode)){
   need(s.st_nlink==1&&s.st_size>=0&&s.st_size<=FILE_MAX,"SEP_INSTALL_SOURCE_CHANGED");total_bytes+=(uint64_t)s.st_size;need(total_bytes<=TOTAL_MAX,"SEP_INSTALL_LIMIT");
   int a=openat(src,name,O_RDONLY|O_NOFOLLOW|O_CLOEXEC),b=openat(dst,name,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);need(a>=0&&b>=0&&fstat(a,&check)==0&&same_file(&s,&check),"SEP_INSTALL_SOURCE_CHANGED");
   unsigned char buf[65536];off_t done=0;while(done<s.st_size){size_t count=(size_t)(s.st_size-done);if(count>sizeof(buf))count=sizeof(buf);ssize_t n=read(a,buf,count);if(n<0&&errno==EINTR)continue;need(n>0,"SEP_INSTALL_SOURCE_CHANGED");write_all(b,buf,(size_t)n);done+=n;}unsigned char extra;need(read(a,&extra,1)==0,"SEP_INSTALL_SOURCE_CHANGED");metadata(a,b,s.st_mode,0);need(fstat(a,&check)==0&&same_file(&s,&check),"SEP_INSTALL_SOURCE_CHANGED");close(b);close(a);
  }else if(S_ISLNK(s.st_mode)){
   char link[PATH_MAX];ssize_t n=readlinkat(src,name,link,sizeof(link)-1);need(n>0&&n<(ssize_t)sizeof(link)-1,"SEP_INSTALL_SOURCE_CHANGED");link[n]=0;need(link[0]!='/'&&!strchr(link,'\\'),"SEP_INSTALL_SOURCE_CHANGED");for(ssize_t i=0;i<n;i++)need((unsigned char)link[i]>=32&&(unsigned char)link[i]!=127,"SEP_INSTALL_SOURCE_CHANGED");need(symlinkat(link,dst,name)==0,"SEP_INSTALL_WRITE");
  }else fail("SEP_INSTALL_SOURCE_CHANGED");
  need(fstatat(src,name,&check,AT_SYMLINK_NOFOLLOW)==0&&same_file(&s,&check),"SEP_INSTALL_SOURCE_CHANGED");errno=0;
 }
 need(errno==0,"SEP_INSTALL_READ");closedir(dir);need(fstat(src,&after)==0&&same_file(&before,&after),"SEP_INSTALL_SOURCE_CHANGED");metadata(src,dst,before.st_mode,1);
}
static void identity_at(int fd,const char *name,char out[96]){struct stat s;if(fstatat(fd,name,&s,AT_SYMLINK_NOFOLLOW)<0){need(errno==ENOENT,"SEP_INSTALL_JOURNAL");strcpy(out,"-");return;}if(!S_ISDIR(s.st_mode)){strcpy(out,"other");return;}id_string(&s,out);}
static void inspect(void){char stage[96],target[96];identity_at(journal_fd,"staged.app",stage);identity_at(parent_fd,"DSH SEP.app",target);printf("OK\t%s\t%s\t",stage,target);int fd=openat(journal_fd,"state.json",O_RDONLY|O_NOFOLLOW|O_CLOEXEC);if(fd<0){need(errno==ENOENT,"SEP_INSTALL_JOURNAL");putchar('-');}else{regular_private(fd);struct stat a,b;need(fstat(fd,&a)==0&&a.st_size>0&&a.st_size<=1048576,"SEP_INSTALL_JOURNAL");char *data=malloc((size_t)a.st_size);need(data!=NULL,"SEP_INSTALL_MEMORY");size_t done=0;while(done<(size_t)a.st_size){ssize_t n=read(fd,data+done,(size_t)a.st_size-done);if(n<0&&errno==EINTR)continue;need(n>0,"SEP_INSTALL_JOURNAL");done+=(size_t)n;}need(fstat(fd,&b)==0&&same_file(&a,&b),"SEP_INSTALL_JOURNAL");hexout((unsigned char*)data,done);free(data);close(fd);}putchar('\n');fflush(stdout);}
int main(int argc,char **argv){
 signal(SIGPIPE,SIG_IGN);umask(077);need(argc==4,"SEP_INSTALL_PROTOCOL");need(strlen(argv[1])<sizeof(parent_path),"SEP_INSTALL_PATH");strcpy(parent_path,argv[1]);need(strlen(argv[2])==32,"SEP_INSTALL_PROTOCOL");for(int i=0;i<32;i++)need(hx(argv[2][i])>=0,"SEP_INSTALL_PROTOCOL");snprintf(journal_name,sizeof(journal_name),".dsh-sep-install-%s",argv[2]);
 parent_fd=path_directory(parent_path);need(fstat(parent_fd,&parent_identity)==0&&parent_identity.st_uid==geteuid()&&(parent_identity.st_mode&0022)==0,"SEP_INSTALL_PATH");no_acl(parent_fd);char parent_id[96];id_string(&parent_identity,parent_id);need(!strcmp(parent_id,argv[3]),"SEP_INSTALL_PATH_CHANGED");
 lease_fd=openat(parent_fd,".dsh-sep-install.lock",O_RDWR|O_CREAT|O_NOFOLLOW|O_CLOEXEC,0600);need(lease_fd>=0,"SEP_INSTALL_LEASE");regular_private(lease_fd);need(flock(lease_fd,LOCK_EX|LOCK_NB)==0,"SEP_INSTALL_BUSY");struct stat again;need(fstat(lease_fd,&lease_identity)==0&&fstatat(parent_fd,".dsh-sep-install.lock",&again,AT_SYMLINK_NOFOLLOW)==0&&same_id(&lease_identity,&again),"SEP_INSTALL_LEASE");
 puts("OK\tready");fflush(stdout);char *line=malloc(FRAME_MAX+2);need(line!=NULL,"SEP_INSTALL_MEMORY");
 while(fgets(line,FRAME_MAX+2,stdin)){
  size_t n=strlen(line);need(n&&line[n-1]=='\n',"SEP_INSTALL_PROTOCOL");line[n-1]=0;check_parent();char *rest=line,*command=strsep(&rest,"\t");
  if(!strcmp(command,"NEW")&&!rest&&journal_fd<0){open_journal(1);puts("OK");}
  else if(!strcmp(command,"OPEN")&&!rest&&journal_fd<0){open_journal(0);puts("OK");}
  else if(!strcmp(command,"STATE")&&rest&&journal_fd>=0){state_write(rest);puts("OK");}
  else if(!strcmp(command,"INSPECT")&&!rest&&journal_fd>=0){inspect();continue;}
  else if(!strcmp(command,"COPY")&&rest&&journal_fd>=0){char *encoded=strsep(&rest,"\t");need(rest&&strchr(rest,'\t')==NULL,"SEP_INSTALL_PROTOCOL");size_t size;char *source=unhex(encoded,&size);need(size&&size<PATH_MAX&&!memchr(source,0,size),"SEP_INSTALL_PATH");int src=path_directory(source);struct stat s;char id[96];need(fstat(src,&s)==0,"SEP_INSTALL_SOURCE_CHANGED");id_string(&s,id);need(!strcmp(id,rest),"SEP_INSTALL_SOURCE_CHANGED");need(mkdirat(journal_fd,"staged.app",0700)==0,"SEP_INSTALL_JOURNAL");int dst=openat(journal_fd,"staged.app",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(dst>=0,"SEP_INSTALL_JOURNAL");copy_tree(src,dst,0);struct stat end;need(fstat(dst,&end)==0,"SEP_INSTALL_JOURNAL");id_string(&end,id);close(dst);close(src);int check=path_directory(source);need(fstat(check,&end)==0&&same_file(&s,&end),"SEP_INSTALL_SOURCE_CHANGED");close(check);free(source);dir_sync(journal_fd);printf("OK\t%s\n",id);}
  else if(!strcmp(command,"PUBLISH")&&rest&&journal_fd>=0){char id[96];identity_at(journal_fd,"staged.app",id);need(!strcmp(id,rest),"SEP_INSTALL_JOURNAL");check_parent();int r=renameatx_np(journal_fd,"staged.app",parent_fd,"DSH SEP.app",RENAME_EXCL);if(r<0&&errno==EEXIST)fail("SEP_INSTALL_TARGET_EXISTS");need(r==0,"SEP_INSTALL_PUBLISH");dir_sync(parent_fd);dir_sync(journal_fd);identity_at(parent_fd,"DSH SEP.app",id);need(!strcmp(id,rest),"SEP_INSTALL_JOURNAL");printf("OK\t%s\n",id);}
  else if(!strcmp(command,"QUIT")&&!rest){puts("OK\tclosed");fflush(stdout);break;}
  else fail("SEP_INSTALL_PROTOCOL");
  need(fflush(stdout)==0,"SEP_INSTALL_CHANNEL");
 }
 free(line);if(journal_fd>=0)close(journal_fd);close(lease_fd);close(parent_fd);return 0;
}
