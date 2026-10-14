#include <stdio.h>
#include "policy-state.h"
typedef struct {int current, result, calls, reads;bool accepted;} PolicyEnvironment;
static int readPolicy(void *p){PolicyEnvironment *e=p;e->reads++;return e->current;}
static bool setRegular(void *p){PolicyEnvironment *e=p;e->calls++;e->current=e->result;return e->accepted;}
static int failed;
static void check(int id,const char *name,PolicyEnvironment e,int wantCalls,bool wantAccepted,bool wantRegular,int wantAfter){
 int initial=e.current;ProbePolicyState r=probePolicyState(readPolicy,setRegular,&e);
 bool ok=e.calls==wantCalls&&e.reads==2&&r.initial==initial&&r.after==wantAfter&&r.attempted==(wantCalls==1)&&r.setterAccepted==wantAccepted&&r.regular==wantRegular;
 printf("%s %d - %s\n",ok?"ok":"not ok",id,name);if(!ok)failed++;
}
int main(void){puts("TAP version 13");
 check(1,"already regular does not request a redundant policy change",(PolicyEnvironment){.current=0,.result=0,.accepted=false},0,false,true,0);
 check(2,"a nonregular policy requests regular exactly once",(PolicyEnvironment){.current=2,.result=0,.accepted=true},1,true,true,0);
 check(3,"false setter result does not override observed regular state",(PolicyEnvironment){.current=1,.result=0,.accepted=false},1,false,true,0);
 check(4,"true setter result cannot admit an actually prohibited policy",(PolicyEnvironment){.current=2,.result=2,.accepted=true},1,true,false,2);
 check(5,"failed request with nonregular state remains rejected",(PolicyEnvironment){.current=1,.result=1,.accepted=false},1,false,false,1);
 printf("1..5\n# tests 5\n# pass %d\n# fail %d\n",5-failed,failed);return failed?1:0;
}
