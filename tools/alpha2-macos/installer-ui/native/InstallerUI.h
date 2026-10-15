#import <AppKit/AppKit.h>

// Internal transport supplied only after fixed-bundle admission. Implementers
// must validate protocol nonce/sequence/limits before delivering these replies.
@protocol SEPInstallerPrivateTransport <NSObject>
- (void)requestOperation:(NSString *)operation input:(NSDictionary *)input completion:(void (^)(NSDictionary *reply))completion;
- (void)observeTermination:(void (^)(NSInteger code, BOOL signalled))observer;
@end

@protocol SEPInstallerApplicationOpener <NSObject>
- (void)openInstalledApplication:(NSURL *)url completion:(void (^)(BOOL dispatched))completion;
@end

@interface SEPInstallerUI : NSWindowController <NSWindowDelegate>
- (instancetype)initWithTransport:(id<SEPInstallerPrivateTransport>)transport opener:(id<SEPInstallerApplicationOpener>)opener;
- (void)present;
@property(nonatomic,readonly) NSString *phase;
@property(nonatomic,readonly) BOOL resourcesReleased;
@end
