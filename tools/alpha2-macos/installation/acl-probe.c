/* Test only: compile the actual fixed or frozen implementation in this TU. */
#ifndef SEP_INSTALL_SOURCE
#error SEP_INSTALL_SOURCE must identify an exact recorded input
#endif
#define main install_coordinator_main
#include SEP_INSTALL_SOURCE
#undef main
int main(int argc,char **argv){
 if(argc!=2)return 64;
 int fd=!strcmp(argv[1],"--invalid-fd")?-1:open(argv[1],O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
 filesec_t security=filesec_init();struct stat s;int present=0,read_error=0;
 int read_ok=security&&fstatx_np(fd,&s,security)==0;
 if(!read_ok)read_error=errno;
 int queried=read_ok?filesec_query_property(security,FILESEC_ACL,&present):-1;
 errno=0;acl_t old=acl_get_fd_np(fd,ACL_TYPE_EXTENDED);int old_error=errno,old_present=old!=NULL;
 if(old)acl_free(old);if(security)filesec_free(security);
 printf("{\"readOk\":%s,\"readErrno\":%d,\"queryOk\":%s,\"propertyPresent\":%s,\"classicReturnedAcl\":%s,\"classicErrno\":%d}\n",read_ok?"true":"false",read_error,queried==0?"true":"false",present?"true":"false",old_present?"true":"false",old_error);fflush(stdout);
 no_acl(fd);if(fd>=0)close(fd);puts("OK\tacl-empty");return 0;
}
