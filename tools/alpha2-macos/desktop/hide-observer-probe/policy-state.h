#ifndef SEP_HIDE_TEST_POLICY_STATE_H
#define SEP_HIDE_TEST_POLICY_STATE_H
#include <stdbool.h>
typedef struct { int initial, after; bool attempted, setterAccepted, regular; } ProbePolicyState;
static ProbePolicyState probePolicyState(int (*readPolicy)(void *), bool (*setRegular)(void *), void *context) {
 ProbePolicyState r={0};r.initial=readPolicy(context);
 if(r.initial!=0){r.attempted=true;r.setterAccepted=setRegular(context);}
 r.after=readPolicy(context);r.regular=r.after==0;return r;
}
#endif
