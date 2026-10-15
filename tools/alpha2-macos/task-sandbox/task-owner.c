#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#if !defined(__APPLE__) && !defined(SEP_POSIX_TEST)
#error Production task owner requires Darwin
#endif
static volatile sig_atomic_t cancelled;
static void stop(int signal_number){(void)signal_number;cancelled=1;}
static long long now_ms(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC,&t))_exit(81);return (long long)t.tv_sec*1000+t.tv_nsec/1000000;}
static long number(const char *s,long min,long max){char *end;errno=0;long n=strtol(s,&end,10);return !errno&&*s&&!*end&&n>=min&&n<=max?n:-1;}
int main(int argc,char **argv){
 if(argc<8||argc>264)return 80;
 int single=!strcmp(argv[1],"single");if(!single&&strcmp(argv[1],"family"))return 80;
 long timeout=number(argv[2],1,300000),grace=number(argv[3],1,2000),receipt=number(argv[5],3,128);
 if(timeout<0||grace<0||receipt<0||argv[4][0]!='/'||argv[7][0]!='/'||strlen(argv[6])>32768)return 80;
 for(int i=7;i<argc;i++)if(strlen(argv[i])>8192)return 80;
 struct sigaction sa={0};sa.sa_handler=stop;sigemptyset(&sa.sa_mask);sigaction(SIGTERM,&sa,NULL);sigaction(SIGINT,&sa,NULL);signal(SIGPIPE,SIG_IGN);signal(SIGCHLD,SIG_DFL);
 const pid_t parent=getppid();pid_t child=fork();if(child<0)return 82;
 if(!child){
  signal(SIGTERM,SIG_DFL);signal(SIGINT,SIG_DFL);signal(SIGPIPE,SIG_DFL);
  long max=sysconf(_SC_OPEN_MAX);if(max<0||max>1048576)_exit(83);for(int fd=3;fd<max;fd++)close(fd);
  struct rlimit core={0,0},files={33554432,33554432},descriptors={128,128};
  if(setrlimit(RLIMIT_CORE,&core)||setrlimit(RLIMIT_FSIZE,&files)||setrlimit(RLIMIT_NOFILE,&descriptors)||chdir(argv[4]))_exit(84);
#ifdef SEP_POSIX_TEST
  if(strcmp(argv[6],"POSIX_TEST"))_exit(85);
  execv(argv[7],argv+7);
#else
  char **args=calloc((size_t)argc+1,sizeof *args);if(!args)_exit(86);
  args[0]="/usr/bin/sandbox-exec";args[1]="-p";args[2]=argv[6];for(int i=7;i<argc;i++)args[i-4]=argv[i];
  execv(args[0],args);
#endif
  _exit(87);
 }
 const long long started=now_ms();long long stopping=0;int sent_kill=0,waited=0,status=0;const char *reason="exit";
 for(;;){
  // Only this process reaps this direct child. Its PID cannot be reused
  // between the no-exit result below and kill(): an exited child is a zombie.
  pid_t result=waitpid(child,&status,WNOHANG);
  if(result==child){waited=1;break;}
  if(result<0&&errno!=EINTR){reason="wait_error";break;}
  long long at=now_ms();if(!stopping&&(cancelled||getppid()!=parent||at-started>=timeout)){
   reason=cancelled?"cancelled":getppid()!=parent?"parent_lost":"timeout";stopping=at;kill(child,SIGTERM);
  }
  if(stopping&&!sent_kill&&at-stopping>=grace){kill(child,SIGKILL);sent_kill=1;}
  if(stopping&&at-stopping>=grace+2000){reason="cleanup_deadline";break;}
  struct timespec delay={0,10000000};nanosleep(&delay,NULL);
 }
#ifdef SEP_POSIX_TEST
 const char *applied="false";
#else
 const char *applied="true";
#endif
 int wrote=dprintf((int)receipt,"{\"waited\":%s,\"exitCode\":%d,\"signal\":%d,\"reason\":\"%s\",\"sandboxApplied\":%s,\"descendantsConfirmed\":false,\"mode\":\"%s\"}\n",waited?"true":"false",waited&&WIFEXITED(status)?WEXITSTATUS(status):-1,waited&&WIFSIGNALED(status)?WTERMSIG(status):0,reason,applied,single?"single":"family");
 return wrote<0?88:0;
}
