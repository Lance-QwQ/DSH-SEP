#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <arpa/inet.h>

// Synthetic fixture. A bounded escaped child deliberately outlives its leader.
static int put(const char *path) {
  int f=open(path,O_WRONLY|O_CREAT|O_TRUNC,0600); if(f<0)return errno;
  int result=write(f,"changed",7)==7?0:errno; fsync(f);close(f);return result;
}
int main(int argc,char **argv) {
  if(argc!=7)return 90;
  if(!strcmp(argv[1],"control"))return put(argv[3])?91:0;
  pid_t child=fork();if(child<0)return 92;
  if(child){printf("{\"pid\":%d}\n",child);fflush(stdout);return 0;}
  if(setsid()<0)_exit(93);
  close(0);close(1);close(2);usleep(700000);
  int own=put(argv[2]),original=put(argv[3]),next=put(argv[4]),committed=put(argv[5]);
  int rd=open(argv[3],O_RDONLY),readError=rd<0?errno:0;if(rd>=0)close(rd);
  int sock=socket(AF_INET,SOCK_STREAM,0),networkError=errno;
  if(sock>=0){struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons((unsigned short)atoi(argv[6]));inet_pton(AF_INET,"127.0.0.1",&a.sin_addr);networkError=connect(sock,(struct sockaddr*)&a,sizeof(a))<0?errno:0;close(sock);}
  char result[4096];snprintf(result,sizeof(result),"%s.receipt",argv[2]);
  int f=open(result,O_WRONLY|O_CREAT|O_EXCL,0600);if(f<0)_exit(94);
  dprintf(f,"{\"own\":%d,\"original\":%d,\"next\":%d,\"committed\":%d,\"read\":%d,\"network\":%d,\"pid\":%d}\n",own,original,next,committed,readError,networkError,getpid());fsync(f);close(f);_exit(0);
}
