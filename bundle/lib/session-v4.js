import {createHash} from 'node:crypto';
import {Session,SessionId,SessionLogOffset,KNOWN_SESSION_EVENT_TYPES} from '@deepseek-ai/dsh-session';
import {releasedV4SessionFormatCodec,restoreReleasedV4Artifact} from '@deepseek-ai/dsh-session-format-v3-to-v4';
import {imageOffloadProjection} from '@deepseek-ai/dsh-compaction-image-offload/projection';
import {snapshotJsonValue,deepFreeze} from '@deepseek-ai/dsh-util-values';
import {validateLocalArtifact} from '../modules/session-migration/src/extensions.mjs';

const localTypes=new Set(['task/checkpoint-change','recovery/continuation']);
const knownTypes=new Set([...KNOWN_SESSION_EVENT_TYPES,...localTypes]);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}

/** Explicit, pure V4 review. This is not a live persistence provider or a
 * migration entry: no file, tool, Agent, credential or backend is invoked. */
export function reviewSepV4Session(physicalHeader,physicalRows){
  if(!physicalHeader||typeof physicalHeader!=='object'||Array.isArray(physicalHeader))fail('SEP_BUNDLE_SESSION_INVALID');
  if(physicalHeader.version!==4)fail('SEP_BUNDLE_SESSION_VERSION_UNSUPPORTED');
  if(!Array.isArray(physicalRows))fail('SEP_BUNDLE_SESSION_INVALID');
  if(physicalRows.length>100000)fail('SEP_BUNDLE_SESSION_INPUT_LIMIT');
  let source;
  try{source=snapshotJsonValue({header:physicalHeader,rows:physicalRows});}
  catch{fail('SEP_BUNDLE_SESSION_INVALID');}
  if(source===undefined)fail('SEP_BUNDLE_SESSION_INVALID');
  if(Buffer.byteLength(JSON.stringify(source),'utf8')>16*1024*1024)fail('SEP_BUNDLE_SESSION_INPUT_LIMIT');
  try{
    const events=[],decoder=releasedV4SessionFormatCodec.createDecoder(source.header,'strict');
    const context={emitEvent:event=>events.push(event),emitRun:run=>events.push(...run.expand())};
    for(const row of source.rows)decoder.decodeRow(row,context);
    const inheritedEventCount=decoder.finish(context);
    const artifact={header:decoder.header,events,inheritedEventCount};
    const extensionEvents=events.filter(event=>localTypes.has(event.type));
    // A fork can contain a parent's task log. Its authority rebinding needs
    // a separate reviewed contract; never guess ownership from matching IDs.
    if(inheritedEventCount>0&&extensionEvents.length)fail('SEP_BUNDLE_SESSION_INHERITED_EXTENSION_UNSUPPORTED');
    for(const event of extensionEvents)if(event.type==='task/checkpoint-change'&&event.data?.sessionId!==artifact.header.id)fail('SEP_BUNDLE_SESSION_INVALID');
    validateLocalArtifact(artifact);
    restoreReleasedV4Artifact(artifact,knownTypes);
    Session.fromRestore(SessionId(artifact.header.id),artifact.events,artifact.header,SessionLogOffset(inheritedEventCount),'detached',[imageOffloadProjection]);
    return deepFreeze({artifact,extensionEvents:extensionEvents.length,execution:'none',sourceModified:false,persisted:false,sourceSha256:sha(source),targetSha256:sha(artifact)});
  }catch(error){
    if(error?.code==='SEP_BUNDLE_SESSION_INHERITED_EXTENSION_UNSUPPORTED')throw error;
    // Native and schema errors may contain private event data or identifiers.
    // The caller explicitly receives its reviewed artifact on success only.
    fail('SEP_BUNDLE_SESSION_INVALID');
  }
}
