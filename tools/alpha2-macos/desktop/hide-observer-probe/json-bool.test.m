#import <Foundation/Foundation.h>
#import <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include "json-bool.h"
// Real Foundation serialization, not a JavaScript mock of Objective-C boxing.
static int check(int number,const char *name,int expression,BOOL expected){
 NSError *error=nil;NSData *bytes=[NSJSONSerialization dataWithJSONObject:@{@"value":probeJsonBool(expression)} options:0 error:&error];
 NSDictionary *decoded=bytes?[NSJSONSerialization JSONObjectWithData:bytes options:0 error:&error]:nil;
 id value=decoded[@"value"];
 BOOL valid=!error&&decoded.count==1&&value&&CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID()&&[value boolValue]==expected;
 printf("%s %d - %s\n",valid?"ok":"not ok",number,name);return valid?0:1;
}
int main(void){@autoreleasepool{puts("TAP version 13");int failed=0;
 failed+=check(1,"true C logical expression roundtrips as JSON Boolean",1==1&&2==2,YES);
 failed+=check(2,"false C logical expression roundtrips as JSON Boolean",1==2&&2==2,NO);
 printf("1..2\n# tests 2\n# pass %d\n# fail %d\n",2-failed,failed);return failed?1:0;
}}
