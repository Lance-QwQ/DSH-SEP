import assert from 'node:assert/strict';
export function isPowerShellPolicyBlock(entry,end,stderr){
 if(entry!=='start.ps1'||end?.code!==1||end.signal!==null||!Buffer.isBuffer(stderr))return false;
 // ASCII diagnostic markers survive the local PowerShell output encoding;
 // normalize only line wrapping, never classify arbitrary permission errors.
 const text=stderr.toString('utf8');
 return /\bSecurityError\b/.test(text)&&/FullyQualifiedErrorId\s*:\s*UnauthorizedAccess\b/.test(text)&&/about_Execution_Policies/.test(text.replace(/\r?\n/g,''));
}
export function assertWrapperEnded(end){assert(end&&Number.isInteger(end.code)&&end.signal===null,'VERIFY_WRAPPER_EXIT_UNCONFIRMED');}
export function assertLauncherClosed(end){assert.deepEqual(end,{code:0,signal:null});}
export async function disconnectAndWait(inspector,wait){inspector?.close();await wait();}
