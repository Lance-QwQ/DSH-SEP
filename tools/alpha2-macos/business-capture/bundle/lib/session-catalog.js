import {sessionFormatCatalog as nativeCatalog,createSessionFormatCatalogWithChildren as nativeWithChildren,historicalSessionFormatCatalog} from '@deepseek-ai/dsh-session-format-catalog';
import {currentSessionMessageProjections} from '@deepseek-ai/dsh-session-format-catalog/message-projections';
import {releasedV4SessionFormatCodec,restoreReleasedV4Artifact} from '@deepseek-ai/dsh-session-format-v3-to-v4';
import {SessionFormatUnsupportedMigrationError} from '@deepseek-ai/dsh-session-format';
import {Session,SessionId,SessionLogOffset,KNOWN_SESSION_EVENT_TYPES,SEP_SESSION_EVENT_TYPES} from './session-vocabulary.js';
import {validateLocalArtifact} from '../modules/session-migration/src/extensions.mjs';

export {SessionFormatUnsupportedMigrationError,historicalSessionFormatCatalog};

/** Validate current native semantics plus exact SEP extension transitions.
 * @param artifact - logical V4 events and exact inherited cut.
 * @returns the restored current artifact; no effects are dispatched. */
export function restoreSepArtifact(artifact){
  validateLocalArtifact(artifact);
  if(artifact.inheritedEventCount>0&&artifact.events.some(event=>SEP_SESSION_EVENT_TYPES.has(event.type))&&(!artifact.header.parentSession||artifact.header.parentSession===artifact.header.id))throw new Error('SEP_SESSION_PARENT_REQUIRED');
  for(const event of artifact.events)if(event.type==='task/checkpoint-change'&&event.seq>=artifact.inheritedEventCount&&event.data.sessionId!==artifact.header.id)throw new Error('SEP_SESSION_SCOPE');
  const result=restoreReleasedV4Artifact(artifact,KNOWN_SESSION_EVENT_TYPES);
  Session.fromRestore(SessionId(result.header.id),result.events,result.header,SessionLogOffset(result.inheritedEventCount),'detached',currentSessionMessageProjections);
  return result;
}

function withSepCurrent(catalog){
  return Object.freeze({...catalog,createRestore(header,options){
    if(header?.version!==4){
      const restore=catalog.createRestore(header,options);
      return {header:restore.header,decodeRow(row){
        if(SEP_SESSION_EVENT_TYPES.has(row?.type))throw new SessionFormatUnsupportedMigrationError('SEP_SESSION_HISTORICAL_EXTENSION_UNSUPPORTED');
        restore.decodeRow(row);
      },finish:()=>restore.finish()};
    }
    const decoder=releasedV4SessionFormatCodec.createDecoder(header,options.recovery),events=[];
    const context={emitEvent:event=>events.push(event),emitRun:run=>events.push(...run.expand())};
    return {header:decoder.header,decodeRow:row=>decoder.decodeRow(row,context),finish(){
      return restoreSepArtifact({header:decoder.header,events,inheritedEventCount:decoder.finish(context)});
    }};
  }});
}

export const sessionFormatCatalog=withSepCurrent(nativeCatalog);
/** Preserve the official historical child inventory and current SEP reader.
 * @param children - complete official child evidence.
 * @returns an immutable catalog. */
export function createSessionFormatCatalogWithChildren(children){return withSepCurrent(nativeWithChildren(children));}
