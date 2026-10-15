import {isDeepStrictEqual} from 'node:util';
import JsonlSessionPersistence from '../host/session-jsonl/index.js';
import {SessionPersistenceCorruptionError} from '@deepseek-ai/dsh-session-persistence';
import {SEP_SESSION_EVENT_TYPES} from './session-vocabulary.js';
import {restoreSepArtifact} from './session-catalog.js';

const fail=code=>{throw new SessionPersistenceCorruptionError(code);};
async function rawRead(storage,id,options){
  const handle=await JsonlSessionPersistence.prototype.open.call(storage,id,'read',options);
  try{return {header:handle.header,events:(await handle.read(0,Number.MAX_SAFE_INTEGER,options)).events,cut:handle.inheritedEventCount};}
  finally{await handle.close();}
}

/** Prove an inherited SEP prefix against durable parents, retaining original
 * task identities. A missing/cyclic/over-deep or altered parent is refused.
 * @param storage - this owned provider.
 * @param header - current logical header.
 * @param events - full current event array.
 * @param cut - exact fork prefix length.
 * @param options - optional read cancellation, forwarded to native I/O.
 * @param seen - per-operation ancestor inventory, never shared across calls. */
export async function assertSepParent(storage,header,events,cut,options={},seen=new Set()){
  options.signal?.throwIfAborted();
  if(cut===0||!events.some(event=>SEP_SESSION_EVENT_TYPES.has(event.type)))return;
  if(seen.has(header.id)||seen.size>=64)fail('SEP_SESSION_PARENT_CHAIN_INVALID');
  seen.add(header.id);
  let parent;
  try{parent=await rawRead(storage,header.parentSession,options);}
  catch{options.signal?.throwIfAborted();fail('SEP_SESSION_PARENT_UNAVAILABLE');}
  options.signal?.throwIfAborted();
  if(parent.header.id!==header.parentSession||parent.header.cwd!==header.cwd||cut>parent.events.length||!isDeepStrictEqual(events.slice(0,cut),parent.events.slice(0,cut)))fail('SEP_SESSION_PARENT_PREFIX_MISMATCH');
  await assertSepParent(storage,parent.header,parent.events,parent.cut,options,seen);
}

/** Validate a complete append candidate before the native publisher writes.
 * @param storage - the owned provider, already serialized by the native handle.
 * @param header - immutable current writer header.
 * @param events - new contiguous batch.
 * @param materialized - whether the prior prefix is durable.
 * @param cut - exact inherited prefix length. */
export async function assertSepAppend(storage,header,events,materialized,cut){
  const prior=materialized?(await rawRead(storage,header.id)).events:[];
  const candidate=[...prior,...events];
  try{restoreSepArtifact({header:{...header,delegationDepth:header.delegationDepth??0},events:candidate,inheritedEventCount:cut});}
  catch{fail('SEP_SESSION_APPEND_INVALID');}
  await assertSepParent(storage,header,candidate,cut);
}

/** Keep the native handle's ownership, serialization and cleanup while
 * withholding reads until the full inherited SEP prefix is verified.
 * @param storage - owned provider.
 * @param handle - original native handle.
 * @returns an interface-preserving governed handle. */
export function governSepHandle(storage,handle){
  const read=async(offset=0,length=Number.MAX_SAFE_INTEGER,options)=>{
    const selected=await handle.read(offset,length,options);
    const full=offset===0&&length===Number.MAX_SAFE_INTEGER?selected:await handle.read(0,Number.MAX_SAFE_INTEGER,options);
    if(!isDeepStrictEqual(selected.events,full.events.slice(offset,offset+length)))fail('SEP_SESSION_SOURCE_CHANGED');
    await assertSepParent(storage,handle.header,full.events,handle.inheritedEventCount,options);
    return selected;
  };
  return new Proxy(handle,{get(target,key){if(key==='read')return read;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
