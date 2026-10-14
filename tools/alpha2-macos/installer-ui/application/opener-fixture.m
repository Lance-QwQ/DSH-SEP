#import <AppKit/AppKit.h>
// Signed synthetic app only. The fixed test lifetime is not a production
// shutdown mechanism and is never copied into the actual SEP payload.
int main(void){@autoreleasepool{[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];dispatch_after(dispatch_time(DISPATCH_TIME_NOW,1500*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[NSApp terminate:nil];});[NSApp run];return 0;}}
