/* Native test operator only: own the diagnostic flock until stdin EOF. */
#include <fcntl.h>
#include <stdio.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
int main(int argc,char **argv){
  if(argc!=2)return 64;
  int fd=open(argv[1],O_RDWR|O_CREAT|O_NOFOLLOW|O_CLOEXEC,0600);struct stat st;
  if(fd<0||fstat(fd,&st)||!S_ISREG(st.st_mode)||st.st_nlink!=1||st.st_uid!=getuid()||(st.st_mode&0777)!=0600||flock(fd,LOCK_EX|LOCK_NB))return 78;
  puts("LOCKED");fflush(stdout);char byte;
  while(read(STDIN_FILENO,&byte,1)>0){}
  if(flock(fd,LOCK_UN)||close(fd))return 1;
  return 0;
}
