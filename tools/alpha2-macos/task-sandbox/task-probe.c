#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <arpa/inet.h>
extern char **environ;
static int put(const char *p){int f=open(p,O_CREAT|O_WRONLY|O_TRUNC,0600);if(f<0)return errno;int e=write(f,"changed",7)==7?0:errno;fsync(f);close(f);return e;}
int main(int argc,char **argv){
 if(argc<2)return 99;
 if(!strcmp(argv[1],"echo")){char b[128];ssize_t n;while((n=read(0,b,sizeof b))>0){if(write(1,b,(size_t)n)!=n)return 98;}return 0;}
 if(!strcmp(argv[1],"sleep")){signal(SIGTERM,SIG_IGN);sleep(20);return 0;}
 if(!strcmp(argv[1],"flood")){char b[8192];memset(b,'x',sizeof b);for(int i=0;i<256;i++)if(write(1,b,sizeof b)<0)return 0;return 0;}
 if(!strcmp(argv[1],"fork")){errno=0;pid_t p=fork();if(p==0)_exit(42);int e=errno;if(p>0)waitpid(p,NULL,0);printf("{\"denied\":%s,\"errno\":%d}\n",p<0?"true":"false",e);return 0;}
 if(!strcmp(argv[1],"vfork")){errno=0;
#ifdef __clang__
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
#endif
  pid_t p=vfork(); // Deliberately test the deprecated process-creation path.
#ifdef __clang__
#pragma clang diagnostic pop
#endif
  if(p==0)_exit(42);int e=errno;if(p>0)waitpid(p,NULL,0);printf("{\"denied\":%s,\"errno\":%d}\n",p<0?"true":"false",e);return 0;
 }
 if(!strcmp(argv[1],"spawn")){pid_t p=0;char *a[]={argv[0],"echo",NULL};int e=posix_spawn(&p,argv[0],NULL,NULL,a,environ);if(!e)waitpid(p,NULL,0);printf("{\"denied\":%s,\"errno\":%d}\n",e?"true":"false",e);return 0;}
 if(!strcmp(argv[1],"boundaries")&&argc==8){
  int own=put(argv[2]),original=put(argv[3]),controller=put(argv[4]),next=put(argv[5]);int f=open(argv[3],O_RDONLY),rd=f<0?errno:0;if(f>=0)close(f);
  int s=socket(AF_INET,SOCK_STREAM,0),net=errno;if(s>=0){struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons((unsigned short)atoi(argv[6]));inet_pton(AF_INET,"127.0.0.1",&a.sin_addr);net=connect(s,(struct sockaddr*)&a,sizeof a)<0?errno:0;close(s);}int runtime=put(argv[7]);
  printf("{\"own\":%d,\"original\":%d,\"controller\":%d,\"next\":%d,\"read\":%d,\"network\":%d,\"runtime\":%d}\n",own,original,controller,next,rd,net,runtime);return 0;
 }
 if(!strcmp(argv[1],"family")&&argc==3){pid_t p=fork();if(p<0)return 90;if(p){printf("{\"child\":%d}\n",p);fflush(stdout);return 0;}if(setsid()<0)_exit(91);close(0);close(1);close(2);usleep(500000);int e=put(argv[2]);_exit(e?92:0);}
 return 97;
}
