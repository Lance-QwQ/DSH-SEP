#ifndef SEP_HIDE_TEST_JSON_BOOL_H
#define SEP_HIDE_TEST_JSON_BOOL_H
#import <Foundation/Foundation.h>
// C logical operators yield int. Explicit BOOL construction preserves JSON type.
static NSNumber *probeJsonBool(int predicate){return [NSNumber numberWithBool:predicate!=0];}
#endif
