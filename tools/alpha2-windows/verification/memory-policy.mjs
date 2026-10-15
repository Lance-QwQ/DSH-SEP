import assert from 'node:assert/strict';
export function verifyFreshMemoryPolicy(settings){
 // Fresh project preferences are permissive; the fixed installation policy
 // disables capture. The API reports the conjunction separately.
 assert.deepEqual(settings.controls,{capture:true,recall:true});
 assert.deepEqual(settings.configured,{capture:false,recall:true});
 assert.deepEqual(settings.effective,{capture:false,recall:true});
}
