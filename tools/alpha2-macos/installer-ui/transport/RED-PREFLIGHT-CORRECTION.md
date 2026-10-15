# r58 test fixture correction

r58 did not reach Objective-C compilation or any of the fifteen transport definitions. Its synthetic `exit-eof` preflight failed: the parent called `stdout.end()` before exiting. Ending that stream could itself signal EOF even while the test descendant retained a duplicate stdout descriptor, invalidating the intended parent-exit-before-EOF fixture. This is a test setup failure, not a native transport RED result.

Only that synthetic mode now exits its own parent after the final frame's write callback, without first ending stdout. Its explicit test descendant still holds stdout for 350 ms. The fifteen native definitions, transport stub, header and protocol remain unchanged.

An isolated POSIX A/B check used the exact old/new fixture bytes with the same preflight under Linux Node 24.19.0: the old variant failed the inherited-EOF assertion and the new variant passed it. This supports the fixture explanation only; it is not macOS NSTask evidence. The next native preflight still requires the same assertion under Mac Node 24.21.0 before compiling and running the original fifteen definitions. The native RED is still `not_run` until then.

`FREEZE-RED.json` preserves the original r58 inputs; `FREEZE-RED-R2.json` identifies this correction. The r58 archive and original failed logs remain unchanged in the external evidence directory.
