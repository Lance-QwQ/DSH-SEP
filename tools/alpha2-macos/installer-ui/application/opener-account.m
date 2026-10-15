#import <Foundation/Foundation.h>
#import <pwd.h>
#import <unistd.h>
int main(void){@autoreleasepool{struct passwd *account=getpwuid(geteuid());if(!account||!account->pw_dir)return 1;NSDictionary *value=@{@"uid":@(geteuid()),@"home":[NSString stringWithUTF8String:account->pw_dir]};NSData *bytes=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];fwrite(bytes.bytes,1,bytes.length,stdout);fputc('\n',stdout);return 0;}}
