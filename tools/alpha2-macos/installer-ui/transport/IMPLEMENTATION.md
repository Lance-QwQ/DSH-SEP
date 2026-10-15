# Native transport implementation candidate

The fifteen original definitions and corrected fixture are unchanged from r59. Actual macOS execution of this implementation is pending; do not label it GREEN based on source review alone.

The internal initializer consumes the admitted nested role records, rereads Node/controller through no-follow descriptors, checks regular-file identity before/after streaming SHA-256, and refuses mismatches before launch. This is a second program-input check, not an OS sandbox against arbitrary same-user replacement between verification and execution. NSBundle admission and final package integrity remain independent required layers.

The private NSTask has only the fixed executable and controller path, generated nonce, compiled manifest SHA and PATH/LANG environment. Its stdin descriptor uses Darwin `F_SETNOSIGPIPE` so a closed pipe is classified without installing a process-global signal handler. Requests are at most 4 KiB and one at a time. Response reads are bounded to 16 KiB plus one overflow byte; strict UTF-8, complete single-frame shape, protocol, nonce, sequence and phase/operation must match. EOF closes admission. A bad response locks the channel and closes only its input end to request the controller's own EOF cleanup, while output continues draining. No child is force-killed.

The stdout handler synchronously hands bounded chunks to the main owner thread, keeping pipe backpressure instead of an unlimited queue of captured data. Stderr is consumed in 64 KiB chunks, discarded and represented only by a saturated counter. It is never rendered or persisted. Final response completion occurs before termination notification; both real NSTask termination and stdout EOF must have arrived. A blocked close keeps the owner and reports its classification. The UI separately requires a truthful closed receipt and actual normal exit, so this transport does not promote EOF or exit 0 into resource release.

The source of the per-descriptor SIGPIPE flag is Apple's XNU `bsd/sys/fcntl.h` (`F_SETNOSIGPIPE`, no SIGPIPE on EPIPE): https://github.com/apple/darwin-xnu/blob/main/bsd/sys/fcntl.h . Actual use is still verified by the native candidate tests.

The remaining product stage must combine this transport with fixed NSBundle admission and the real controller. This candidate does not install payloads, add a public command-line interface, grant model access, or validate physical user interaction.
