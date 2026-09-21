/** Windows CRT startup descriptors for a Node payload with one inherited control pipe. */
import type { NativePtr, Win32ProcessBindings } from './ffi.ts';
/** Native stdio handles plus the single additional descriptor selected by the launcher. */
export interface InheritedControlStdio {
    stdin: NativePtr;
    stdout: NativePtr;
    stderr: NativePtr;
    control: {
        fileDescriptor: 7;
        handle: NativePtr;
    };
}
/**
 * Encode the CRT's descriptor table before the child runtime allocates descriptors.
 * Supported Windows targets use 64-bit handles. Empty slots remain closed, and the
 * backing Buffer must remain alive until CreateProcess returns.
 * @param api - native file-type inspection for inherited handles.
 * @param stdio - standard handles and the provider-owned fd-7 control pipe.
 * @returns descriptor count, flag bytes, and handle values for STARTUPINFO's reserved CRT fields.
 */
export declare function inheritedControlStdio(api: Pick<Win32ProcessBindings, 'getFileType'>, stdio: InheritedControlStdio): Buffer;
//# sourceMappingURL=control-stdio.d.ts.map