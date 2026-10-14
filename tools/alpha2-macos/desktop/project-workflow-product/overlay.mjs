import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Object.assign(Error('SEP_PROJECT_UI_OVERLAY_CHANGED'),{code:'SEP_PROJECT_UI_OVERLAY_CHANGED'});};
export async function migrateOverlay({read,compareSwap,previous,next}){
 if(typeof previous!=='string'||typeof next!=='string'||!previous.length||!next.length||previous===next||Buffer.byteLength(previous)>1048576||Buffer.byteLength(next)>1048576)fail();
 const current=await read();if(current===next)return {status:'pass',changed:false,sha256:sha(next)};if(current!==previous)fail();
 await compareSwap({expectedSha256:sha(previous),text:next});if(await read()!==next)fail();return {status:'pass',changed:true,sha256:sha(next)};
}
