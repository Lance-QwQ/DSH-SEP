// Test-only, read-only capability check. Never prompts or edits TCC state.
// Apple: AXIsProcessTrusted returns whether this process is a trusted AX client.
#import <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdbool.h>
int main(void) { bool trusted = AXIsProcessTrusted(); printf("{\"schema\":1,\"status\":\"pass\",\"trusted\":%s,\"prompted\":false,\"actions\":0}\n", trusted ? "true" : "false"); return 0; }
