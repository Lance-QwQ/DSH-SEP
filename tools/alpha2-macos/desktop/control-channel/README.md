# Private Electron control transport prototype

Scope: **transport-only candidate**, independently derived synthetic application.
No product launch-full, captured main, broker, lease, ready or quit flow is changed.
There are no model calls. `hello` means one bound fd3 message was acknowledged;
it never means a host, renderer, workspace, settings view or lease is ready.

`createProbeChannel({stream,binding,role,timeoutMs})` binds one already-owned duplex
stream to exact `{nonce,programSha256,generation}` (64/64/32 lowercase hex).
Controller methods are `hello()` then `ping()`. The responder automatically
acknowledges valid ordered requests. `status`, `whenClosed`, and local `close`
describe transport admission only; no status can certify released resources.

Every canonical UTF-8 JSON line has exactly these keys in this order:
`protocol:1`, `kind` (`hello`, `ping`, `ack`), `nonce`, `programSha256`,
`generation`, `requestId`. IDs are monotonically increasing 24-hex counters,
starting at one; acknowledgments must match the oldest outstanding request.
The first request is hello; it cannot reset the sequence later. Extra or duplicate
keys, wrong identity, unknown kinds and replays poison the channel. There is no
generic command, URL, pathname, credential, code or arbitrary payload field.

Frames are at most 4096 bytes before newline. Accumulation checks the limit
before concatenation. At most eight controller requests can wait for replies;
a ninth is refused before dispatch. The responder limits a received batch to
32 frames and write buffering to 32768 bytes. Timeout, malformed input, I/O
failure and EOF close admission and reject pending work. Local close never
manufactures an acknowledgment. The request deadline is not a lifetime timer.

Nine pure tests use real Node duplex streams and hand-authored frames. Their
original missing-feature implementation failed all nine; the implemented
candidate passes all nine on Windows Node 24.21.0. Logs and the original stub
are retained under the D: `control-channel` artifact directory. This result does
not certify native fd behavior.

## Native probe, awaiting CI

`ci-job.yml` uses the existing fixed-carrier downloader, artifact 11871124360 and
outer SHA `63cc8bd74c5750911b668ce5a41aa15239db1a59911204355ec334d4fa4bc0b8`.
The pinned ASAR tool remains 3.4.1. The build copies the signed carrier into a
fresh runner-temp directory and replaces only that copy's app.asar with
package.json, fixture-main.cjs and channel.mjs. It updates the exact ASAR header
integrity in Info.plist, ad-hoc signs the fixture and verifies the signature.
PREPARED.json binds original/new ASAR, executable, input files and carrier receipt.
This does not modify captured production bytes or create a distributable package.

The parent spawns the exact fixture executable using stdio descriptor 3 as a
separate pipe and reads only that ChildProcess's stream. The Electron main wraps
fd3 with `net.Socket`; fstat records its actual socket/FIFO kind. It learns the
fresh nonce/generation solely from the first private hello and checks its program
hash against its real app.asar. Binding data is absent from env, argv, renderer
URL, preload and renderer globals. The fixture creates a sandboxed hidden
BrowserWindow without Node integration/preload and checks fixed DOM content,
`typeof process`, `typeof require` and absence of a control API. This proves only
that the test used real packaged Electron and an isolated synthetic renderer.

Four planned native cases are duplex hello plus eight pings, wrong nonce,
replayed acknowledgment, and EOF without an acknowledgment. The successful case
half-closes the parent's write side but leaves its read side alive until actual
peer EOF. The parent also waits for the exact main process's normal exit and
stdio closure. A retained helper endpoint or missing close receipt cannot pass.
The diagnostic stdout object is never accepted as a protocol acknowledgment.
Only these isolated fixtures use a bounded overall execution deadline.

Unexpected timeout can trigger separate test cleanup of the still-owned process
group. Such cleanup remains `blocked`; it does not prove arbitrary descendant
release, and the runner does not start later cases after it. If the main process
already exited but stream completion is unknown, no reaped PID is signalled.
No successful product cleanup, Finder support, physical Dock activation, lease
ownership, product renderer ready, or user quit behavior is claimed here.

Runtime source allowlist: channel.mjs only. The remaining six files are tests,
fixture/build/probe, workflow and documentation; none are product runtime inputs.
