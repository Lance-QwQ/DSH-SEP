export * from '@deepseek-ai/dsh-session-persistence';
import {validateStoredEvents as validateNativeEvents,SessionPersistenceCorruptionError} from '@deepseek-ai/dsh-session-persistence';
import {adoptSessionEvent} from '@deepseek-ai/dsh-session';
import {SEP_SESSION_EVENT_TYPES} from './session-vocabulary.js';
import {validateLocalArtifact} from '../modules/session-migration/src/extensions.mjs';

/** Retain native storage admission for every other event and validate the two
 * SEP extensions with the shipped exact schemas and task revision fold.
 * @param meta - current logical stored header.
 * @param events - exclusively owned decoded events, adopted in place.
 * @param location - native refusal location.
 * @returns the same event array, with each record adopted and frozen. */
export function validateStoredEvents(meta,events,location){
  try{validateLocalArtifact({header:meta,events,inheritedEventCount:0});}
  catch{throw new SessionPersistenceCorruptionError('SEP_SESSION_INVALID');}
  const native=validateNativeEvents(meta,events.filter(event=>!SEP_SESSION_EVENT_TYPES.has(event.type)),location);
  let index=0;
  for(let i=0;i<events.length;i++)events[i]=SEP_SESSION_EVENT_TYPES.has(events[i].type)?adoptSessionEvent(events[i]):native[index++];
  return events;
}
