#define _DARWIN_C_SOURCE
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/file.h>
#include <sys/acl.h>
#include <pwd.h>
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

/* Trusted metadata primitive; never forks and accepts no arbitrary file name. */
#define RECORD_MAX (33554432U)
#define FRAME_MAX (RECORD_MAX*2U+256U)
static int home_fd=-1,gov_fd=-1,transactions_fd=-1,record_fd=-1,lock_fd=-1;
static char home_path[PATH_MAX],txid[33];
static struct stat home_id,gov_id,transactions_id,record_id,lock_id;
struct listed_record {char id[33];struct stat identity;};
static struct listed_record listed[64];
static size_t listed_count=0;
static int list_active=0;
static void fail(const char *code){printf("ERR\t%s\n",code);fflush(stdout);exit(70);}
static void need(int ok,const char *code){if(!ok)fail(code);}
static int same_id(const struct stat*a,const struct stat*b){return a->st_dev==b->st_dev&&a->st_ino==b->st_ino;}
static int same_file(const struct stat*a,const struct stat*b){return same_id(a,b)&&a->st_size==b->st_size&&a->st_mode==b->st_mode&&a->st_nlink==b->st_nlink&&a->st_mtimespec.tv_sec==b->st_mtimespec.tv_sec&&a->st_mtimespec.tv_nsec==b->st_mtimespec.tv_nsec&&a->st_ctimespec.tv_sec==b->st_ctimespec.tv_sec&&a->st_ctimespec.tv_nsec==b->st_ctimespec.tv_nsec;}
static void identity(const struct stat*s,char out[96]){snprintf(out,96,"%ju:%ju",(uintmax_t)s->st_dev,(uintmax_t)s->st_ino);}
static void sync_dir(int fd){need(fsync(fd)==0,"SEP_INSTALLER_DURABILITY");}
static void sync_file(int fd){need(fsync(fd)==0&&fcntl(fd,F_FULLFSYNC)==0,"SEP_INSTALLER_DURABILITY");}
static void no_acl(int fd){
 filesec_t sec=filesec_init();need(sec!=NULL,"SEP_INSTALLER_ACL_READ");struct stat s;int present=0;
 if(fstatx_np(fd,&s,sec)!=0||filesec_query_property(sec,FILESEC_ACL,&present)!=0){filesec_free(sec);fail("SEP_INSTALLER_ACL_READ");}
 if(!present){filesec_free(sec);return;}
 acl_t acl=NULL;int got=filesec_get_property(sec,FILESEC_ACL,&acl);filesec_free(sec);
 need(got==0&&acl!=NULL,"SEP_INSTALLER_ACL_READ");
#ifdef _FILESEC_REMOVE_ACL
 need(acl!=(acl_t)_FILESEC_REMOVE_ACL,"SEP_INSTALLER_ACL_READ");
#endif
 need(acl_valid(acl)==0,"SEP_INSTALLER_ACL_INVALID");acl_entry_t entry;errno=0;int r=acl_get_entry(acl,ACL_FIRST_ENTRY,&entry),saved=errno;acl_free(acl);
 if(r==0)fail("SEP_INSTALLER_ACL");
 need(r==-1&&saved==EINVAL,"SEP_INSTALLER_ACL_ENUMERATION");
}
static void private_dir(int fd){struct stat s;need(fstat(fd,&s)==0&&S_ISDIR(s.st_mode)&&s.st_uid==geteuid()&&(s.st_mode&0777)==0700,"SEP_INSTALLER_JOURNAL");no_acl(fd);}
static void private_file(int fd){struct stat s;need(fstat(fd,&s)==0&&S_ISREG(s.st_mode)&&s.st_uid==geteuid()&&s.st_nlink==1&&(s.st_mode&0777)==0600,"SEP_INSTALLER_JOURNAL");no_acl(fd);}
static int path_dir(const char*path){
 need(path&&path[0]=='/'&&path[1]&&strlen(path)<PATH_MAX&&path[strlen(path)-1]!='/',"SEP_INSTALLER_PATH");
 char copy[PATH_MAX];strcpy(copy,path+1);int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);need(fd>=0,"SEP_INSTALLER_PATH");char *cursor=copy,*part;
 while((part=strsep(&cursor,"/"))!=NULL){need(*part&&strcmp(part,".")&&strcmp(part,".."),"SEP_INSTALLER_PATH");for(const unsigned char*p=(unsigned char*)part;*p;p++)need(*p>=32&&*p!=127&&*p!='\\',"SEP_INSTALLER_PATH");int next=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);need(next>=0,"SEP_INSTALLER_PATH");fd=next;}
 struct statfs fs;need(fstatfs(fd,&fs)==0&&!strcmp(fs.f_fstypename,"apfs"),"SEP_INSTALLER_FILESYSTEM");return fd;
}
static int child_dir(int parent,const char*name,int create,int is_private){
 struct stat before,after;int r=fstatat(parent,name,&before,AT_SYMLINK_NOFOLLOW);
 if(r<0){need(errno==ENOENT,"SEP_INSTALLER_PATH");if(!create)return -1;need(mkdirat(parent,name,0700)==0,"SEP_INSTALLER_PATH");sync_dir(parent);need(fstatat(parent,name,&before,AT_SYMLINK_NOFOLLOW)==0,"SEP_INSTALLER_PATH");}
 need(S_ISDIR(before.st_mode)&&before.st_uid==geteuid()&&(before.st_mode&0022)==0,"SEP_INSTALLER_PATH");
 int fd=openat(parent,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(fd>=0&&fstat(fd,&after)==0&&same_id(&before,&after),"SEP_INSTALLER_PATH");if(is_private)private_dir(fd);return fd;
}
static int support_dir(int create){int a=child_dir(home_fd,"Library",create,0);if(a<0)return -1;int b=child_dir(a,"Application Support",create,0);close(a);return b;}
static int data_exists(void){int a=support_dir(0);if(a<0)return 0;int b=child_dir(a,"DSH SEP",0,0);close(a);if(b<0)return 0;struct stat s;int r=fstatat(b,"alpha2-mac-finder-preview",&s,AT_SYMLINK_NOFOLLOW);close(b);if(r<0){need(errno==ENOENT,"SEP_INSTALLER_PATH");return 0;}need(!S_ISLNK(s.st_mode),"SEP_INSTALLER_PATH");return 1;}
static char *json_string(const char*s){size_t n=strlen(s);char*r=malloc(n*6+3);need(r!=NULL,"SEP_INSTALLER_MEMORY");char*p=r;*p++='"';for(const unsigned char*q=(const unsigned char*)s;*q;q++){if(*q=='"'||*q=='\\'){*p++='\\';*p++=(char)*q;}else{need(*q>=32&&*q!=127,"SEP_INSTALLER_PATH");*p++=(char)*q;}}*p++='"';*p=0;return r;}
static void check_home(void){int fd=path_dir(home_path);struct stat s;need(fstat(fd,&s)==0&&same_id(&s,&home_id)&&s.st_uid==geteuid()&&(s.st_mode&0022)==0,"SEP_INSTALLER_PATH_CHANGED");close(fd);}
static char *snapshot(void){
 check_home();char hid[96],pid[96]="",gid[96]="";identity(&home_id,hid);int a=child_dir(home_fd,"Applications",0,0),parent_exists=a>=0,target_exists=0;
 if(a>=0){struct stat s;need(fstat(a,&s)==0,"SEP_INSTALLER_PATH");identity(&s,pid);int r=fstatat(a,"DSH SEP.app",&s,AT_SYMLINK_NOFOLLOW);if(r==0)target_exists=1;else need(errno==ENOENT,"SEP_INSTALLER_PATH");close(a);}
 int data=data_exists(),support=support_dir(0),g=-1;if(support>=0){g=child_dir(support,"DSH SEP Installer",0,1);close(support);}int governance_exists=g>=0;if(g>=0){struct stat s;need(fstat(g,&s)==0,"SEP_INSTALLER_PATH");identity(&s,gid);close(g);}
 char parent[PATH_MAX],target[PATH_MAX],data_root[PATH_MAX],governance[PATH_MAX];
 need(snprintf(parent,sizeof(parent),"%s/Applications",home_path)<(int)sizeof(parent)&&snprintf(target,sizeof(target),"%s/Applications/DSH SEP.app",home_path)<(int)sizeof(target)&&snprintf(data_root,sizeof(data_root),"%s/Library/Application Support/DSH SEP/alpha2-mac-finder-preview",home_path)<(int)sizeof(data_root)&&snprintf(governance,sizeof(governance),"%s/Library/Application Support/DSH SEP Installer",home_path)<(int)sizeof(governance),"SEP_INSTALLER_PATH");
 char*h=json_string(home_path),*p=json_string(parent),*t=json_string(target),*d=json_string(data_root),*v=json_string(governance);char*out=malloc(PATH_MAX*32U);need(out!=NULL,"SEP_INSTALLER_MEMORY");
 int n=snprintf(out,PATH_MAX*32U,"{\"account\":{\"uid\":%ju,\"home\":%s,\"identity\":\"%s\"},\"parent\":{\"path\":%s,\"exists\":%s,\"identity\":%s%s%s},\"target\":%s,\"targetExists\":%s,\"dataRoot\":%s,\"dataExists\":%s,\"governanceRoot\":%s,\"governanceExists\":%s,\"governanceIdentity\":%s%s%s}",(uintmax_t)geteuid(),h,hid,p,parent_exists?"true":"false",parent_exists?"\"":"",parent_exists?pid:"null",parent_exists?"\"":"",t,target_exists?"true":"false",d,data?"true":"false",v,governance_exists?"true":"false",governance_exists?"\"":"",governance_exists?gid:"null",governance_exists?"\"":"");
 free(h);free(p);free(t);free(d);free(v);need(n>0&&n<(int)(PATH_MAX*32U),"SEP_INSTALLER_PATH");return out;
}
static int hx(int c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:-1;}
static int valid_id(const char*s){if(strlen(s)!=32)return 0;for(int i=0;i<32;i++)if(hx(s[i])<0)return 0;return 1;}
static char *unhex(const char*s,size_t*size){size_t n=strlen(s);need(n%2==0&&n<=RECORD_MAX*2U,"SEP_INSTALLER_PROTOCOL");char*b=malloc(n/2+1);need(b!=NULL,"SEP_INSTALLER_MEMORY");for(size_t i=0;i<n;i+=2){int a=hx(s[i]),c=hx(s[i+1]);need(a>=0&&c>=0,"SEP_INSTALLER_PROTOCOL");b[i/2]=(char)(a*16+c);}b[n/2]=0;*size=n/2;return b;}
static void hexout(const unsigned char*s,size_t n){const char*h="0123456789abcdef";for(size_t i=0;i<n;i++){putchar(h[s[i]>>4]);putchar(h[s[i]&15]);}}
static void write_all(int fd,const char*s,size_t n){while(n){ssize_t r=write(fd,s,n);if(r<0&&errno==EINTR)continue;need(r>0,"SEP_INSTALLER_JOURNAL");s+=r;n-=(size_t)r;}}
static const char *key_name(const char*key){if(!strcmp(key,"confirmation"))return "confirmation.json";if(!strcmp(key,"core-plan"))return "core-plan.json";if(!strcmp(key,"state"))return "state.json";fail("SEP_INSTALLER_PROTOCOL");return NULL;}
static void check_bindings(void){
 check_home();int support=support_dir(0);need(support>=0,"SEP_INSTALLER_PATH_CHANGED");struct stat s;
 need(fstatat(support,"DSH SEP Installer",&s,AT_SYMLINK_NOFOLLOW)==0&&same_id(&s,&gov_id),"SEP_INSTALLER_PATH_CHANGED");close(support);private_dir(gov_fd);
 need(fstatat(gov_fd,"transactions",&s,AT_SYMLINK_NOFOLLOW)==0&&same_id(&s,&transactions_id),"SEP_INSTALLER_JOURNAL");private_dir(transactions_fd);
 need(fstatat(gov_fd,"lease",&s,AT_SYMLINK_NOFOLLOW)==0&&same_id(&s,&lock_id),"SEP_INSTALLER_JOURNAL");private_file(lock_fd);
 if(record_fd>=0){need(fstatat(transactions_fd,txid,&s,AT_SYMLINK_NOFOLLOW)==0&&same_id(&s,&record_id),"SEP_INSTALLER_JOURNAL");private_dir(record_fd);}
}
static void open_records(int create){
 int support=support_dir(create);need(support>=0,"SEP_INSTALLER_NOT_FOUND");gov_fd=child_dir(support,"DSH SEP Installer",create,1);close(support);need(gov_fd>=0,"SEP_INSTALLER_NOT_FOUND");need(fstat(gov_fd,&gov_id)==0,"SEP_INSTALLER_JOURNAL");
 transactions_fd=child_dir(gov_fd,"transactions",create,1);need(transactions_fd>=0,"SEP_INSTALLER_NOT_FOUND");need(fstat(transactions_fd,&transactions_id)==0,"SEP_INSTALLER_JOURNAL");
 if(!create){record_fd=child_dir(transactions_fd,txid,0,1);need(record_fd>=0,"SEP_INSTALLER_NOT_FOUND");need(fstat(record_fd,&record_id)==0,"SEP_INSTALLER_JOURNAL");}
 lock_fd=openat(gov_fd,"lease",O_RDWR|O_NOFOLLOW|O_CLOEXEC|(create?O_CREAT:0),0600);need(lock_fd>=0,"SEP_INSTALLER_JOURNAL");private_file(lock_fd);need(fstat(lock_fd,&lock_id)==0,"SEP_INSTALLER_JOURNAL");need(flock(lock_fd,LOCK_EX|LOCK_NB)==0,"SEP_INSTALLER_BUSY");
 if(create){need(mkdirat(transactions_fd,txid,0700)==0,"SEP_INSTALLER_JOURNAL");record_fd=child_dir(transactions_fd,txid,0,1);need(record_fd>=0&&fstat(record_fd,&record_id)==0,"SEP_INSTALLER_JOURNAL");sync_dir(transactions_fd);sync_dir(gov_fd);}
 check_bindings();
}
static int compare_record(const void*a,const void*b){return strcmp(((const struct listed_record*)a)->id,((const struct listed_record*)b)->id);}
static void list_records(void){
 need(!list_active&&gov_fd<0,"SEP_INSTALLER_PROTOCOL");list_active=1;check_home();
 int support=support_dir(0);if(support<0){puts("OK\t");return;}
 gov_fd=child_dir(support,"DSH SEP Installer",0,1);close(support);if(gov_fd<0){puts("OK\t");return;}
 need(fstat(gov_fd,&gov_id)==0,"SEP_INSTALLER_JOURNAL");transactions_fd=child_dir(gov_fd,"transactions",0,1);need(transactions_fd>=0&&fstat(transactions_fd,&transactions_id)==0,"SEP_INSTALLER_JOURNAL");
 lock_fd=openat(gov_fd,"lease",O_RDWR|O_NOFOLLOW|O_CLOEXEC);need(lock_fd>=0,"SEP_INSTALLER_JOURNAL");private_file(lock_fd);need(fstat(lock_fd,&lock_id)==0,"SEP_INSTALLER_JOURNAL");need(flock(lock_fd,LOCK_EX|LOCK_NB)==0,"SEP_INSTALLER_BUSY");check_bindings();
 struct stat before,after;need(fstat(transactions_fd,&before)==0,"SEP_INSTALLER_JOURNAL");DIR*dir=fdopendir(dup(transactions_fd));need(dir!=NULL,"SEP_INSTALLER_JOURNAL");struct dirent*entry;
 errno=0;while((entry=readdir(dir))!=NULL){const char*name=entry->d_name;if(!strcmp(name,".")||!strcmp(name,".."))continue;need(valid_id(name),"SEP_INSTALLER_JOURNAL");need(listed_count<64,"SEP_INSTALLER_LIMIT");
  struct stat s,check;need(fstatat(transactions_fd,name,&s,AT_SYMLINK_NOFOLLOW)==0&&S_ISDIR(s.st_mode),"SEP_INSTALLER_JOURNAL");
  int fd=openat(transactions_fd,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(fd>=0&&fstat(fd,&check)==0&&same_id(&s,&check),"SEP_INSTALLER_JOURNAL");private_dir(fd);close(fd);
  need(fstatat(transactions_fd,name,&check,AT_SYMLINK_NOFOLLOW)==0&&same_file(&s,&check),"SEP_INSTALLER_JOURNAL");strcpy(listed[listed_count].id,name);listed[listed_count].identity=s;listed_count++;errno=0;
 }
 need(errno==0,"SEP_INSTALLER_JOURNAL");closedir(dir);need(fstat(transactions_fd,&after)==0&&same_file(&before,&after),"SEP_INSTALLER_JOURNAL");check_bindings();qsort(listed,listed_count,sizeof(listed[0]),compare_record);
 printf("OK\t");for(size_t i=0;i<listed_count;i++){if(i)putchar(',');fputs(listed[i].id,stdout);}putchar('\n');
}
static void select_record(const char*id){
 need(list_active&&gov_fd>=0&&valid_id(id),"SEP_INSTALLER_PROTOCOL");check_bindings();size_t found=listed_count;
 for(size_t i=0;i<listed_count;i++)if(!strcmp(id,listed[i].id)){found=i;break;}
 need(found<listed_count,"SEP_INSTALLER_JOURNAL");if(record_fd>=0){close(record_fd);record_fd=-1;}
 struct stat before;need(fstatat(transactions_fd,id,&before,AT_SYMLINK_NOFOLLOW)==0&&same_id(&before,&listed[found].identity)&&S_ISDIR(before.st_mode),"SEP_INSTALLER_JOURNAL");
 record_fd=openat(transactions_fd,id,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);need(record_fd>=0&&fstat(record_fd,&record_id)==0&&same_id(&before,&record_id),"SEP_INSTALLER_JOURNAL");private_dir(record_fd);strcpy(txid,id);check_bindings();
}
static void read_record(const char*key){
 check_bindings();const char*name=key_name(key);int fd=openat(record_fd,name,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
 if(fd<0){need(errno==ENOENT,"SEP_INSTALLER_JOURNAL");puts("OK\t-");return;}
 private_file(fd);struct stat a,b;need(fstat(fd,&a)==0&&a.st_size>0&&(uint64_t)a.st_size<=RECORD_MAX,"SEP_INSTALLER_JOURNAL");char*data=malloc((size_t)a.st_size);need(data!=NULL,"SEP_INSTALLER_MEMORY");size_t done=0;
 while(done<(size_t)a.st_size){ssize_t n=read(fd,data+done,(size_t)a.st_size-done);if(n<0&&errno==EINTR)continue;need(n>0,"SEP_INSTALLER_JOURNAL");done+=(size_t)n;}
 need(fstat(fd,&b)==0&&same_file(&a,&b)&&fstatat(record_fd,name,&b,AT_SYMLINK_NOFOLLOW)==0&&same_file(&a,&b),"SEP_INSTALLER_JOURNAL");close(fd);check_bindings();printf("OK\t");hexout((unsigned char*)data,done);putchar('\n');free(data);
}
static void write_record(const char*key,const char*encoded){
 check_bindings();const char*name=key_name(key);size_t size;char*data=unhex(encoded,&size);need(size>0&&!memchr(data,0,size),"SEP_INSTALLER_PROTOCOL");
 struct stat before,after;int exists=fstatat(record_fd,name,&before,AT_SYMLINK_NOFOLLOW)==0;if(!exists)need(errno==ENOENT,"SEP_INSTALLER_JOURNAL");
 if(exists){need(!strcmp(key,"state"),"SEP_INSTALLER_JOURNAL");int old=openat(record_fd,name,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);need(old>=0,"SEP_INSTALLER_JOURNAL");private_file(old);need(fstat(old,&after)==0&&same_file(&before,&after),"SEP_INSTALLER_JOURNAL");close(old);}
 char temp[80];snprintf(temp,sizeof(temp),".record-%d-%08x",getpid(),arc4random());int fd=openat(record_fd,temp,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);need(fd>=0,"SEP_INSTALLER_JOURNAL");private_file(fd);write_all(fd,data,size);free(data);sync_file(fd);close(fd);check_bindings();
 int present=fstatat(record_fd,name,&after,AT_SYMLINK_NOFOLLOW)==0;need(exists?(present&&same_file(&before,&after)):(!present&&errno==ENOENT),"SEP_INSTALLER_JOURNAL");
 int r=exists?renameat(record_fd,temp,record_fd,name):renameatx_np(record_fd,temp,record_fd,name,RENAME_EXCL);need(r==0,"SEP_INSTALLER_JOURNAL");sync_dir(record_fd);check_bindings();
}
int main(int argc,char**argv){
 signal(SIGPIPE,SIG_IGN);umask(077);int at=1;const char*home=NULL;
#ifdef SEP_INSTALLER_ENTRY_TESTING
 if(argc>=3&&!strcmp(argv[1],"--test-home")){home=argv[2];at=3;}
#endif
 need(argc==at+1||argc==at+2,"SEP_INSTALLER_ARGUMENT");const char*mode=argv[at];need(!strcmp(mode,"inspect")||!strcmp(mode,"session"),"SEP_INSTALLER_ARGUMENT");
 if(!strcmp(mode,"inspect"))need(argc==at+1,"SEP_INSTALLER_ARGUMENT");else{need(argc==at+2&&valid_id(argv[at+1]),"SEP_INSTALLER_ARGUMENT");strcpy(txid,argv[at+1]);}
 if(!home){struct passwd*p=getpwuid(geteuid());need(p&&p->pw_dir,"SEP_INSTALLER_ACCOUNT");home=p->pw_dir;}need(strlen(home)<sizeof(home_path),"SEP_INSTALLER_PATH");strcpy(home_path,home);home_fd=path_dir(home_path);need(fstat(home_fd,&home_id)==0&&home_id.st_uid==geteuid()&&(home_id.st_mode&0022)==0,"SEP_INSTALLER_PATH");
 if(!strcmp(mode,"inspect")){char*s=snapshot();puts(s);free(s);close(home_fd);return 0;}
 puts("OK\tready");fflush(stdout);char*line=malloc(FRAME_MAX+2U);need(line!=NULL,"SEP_INSTALLER_MEMORY");
 while(fgets(line,(int)FRAME_MAX+2,stdin)){size_t n=strlen(line);need(n&&line[n-1]=='\n',"SEP_INSTALLER_PROTOCOL");line[n-1]=0;char*rest=line,*command=strsep(&rest,"\t");
  if(!strcmp(command,"BEGIN")&&rest&&gov_fd<0&&!list_active){size_t bytes;char*expected=unhex(rest,&bytes);char*now=snapshot();need(strlen(now)==bytes&&!memcmp(now,expected,bytes),"SEP_INSTALLER_PLAN_CHANGED");free(now);free(expected);open_records(1);need(!data_exists(),"SEP_INSTALLER_PLAN_CHANGED");int app=child_dir(home_fd,"Applications",1,0);need(app>=0,"SEP_INSTALLER_PATH");struct stat target;need(fstatat(app,"DSH SEP.app",&target,AT_SYMLINK_NOFOLLOW)<0&&errno==ENOENT,"SEP_INSTALLER_PLAN_CHANGED");close(app);puts("OK");}
  else if(!strcmp(command,"OPEN")&&!rest&&gov_fd<0&&!list_active){open_records(0);puts("OK");}
  else if(!strcmp(command,"LIST")&&!rest&&gov_fd<0&&!list_active){list_records();}
  else if(!strcmp(command,"SELECT")&&rest&&list_active){select_record(rest);puts("OK");}
  else if(!strcmp(command,"READ")&&rest&&record_fd>=0){read_record(rest);}
  else if(!strcmp(command,"WRITE")&&rest&&record_fd>=0&&!list_active){char*key=strsep(&rest,"\t");need(rest&&strchr(rest,'\t')==NULL,"SEP_INSTALLER_PROTOCOL");write_record(key,rest);puts("OK");}
  else if(!strcmp(command,"QUIT")&&!rest){puts("OK\tclosed");fflush(stdout);break;}
  else fail("SEP_INSTALLER_PROTOCOL");
  need(fflush(stdout)==0,"SEP_INSTALLER_CHANNEL");
 }
 free(line);if(record_fd>=0)close(record_fd);if(transactions_fd>=0)close(transactions_fd);if(lock_fd>=0)close(lock_fd);if(gov_fd>=0)close(gov_fd);close(home_fd);return 0;
}
