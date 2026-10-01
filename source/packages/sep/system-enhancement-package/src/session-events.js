import {fail} from './errors.js';

// rc.2 owns a private event log. Prefer its immutable public snapshot, and
// retain only the reviewed v0/CLI event-array contract for older callers.
// An unsupported reader is not an empty conversation or absent permission.
export function sessionEvents(session){
  if(typeof session?.snapshotEvents==='function'){
    const events=session.snapshotEvents();
    if(!Array.isArray(events))fail('SESSION_EVENTS_UNAVAILABLE');
    return events;
  }
  if((session?.header?.version===undefined||session.header.version===0)&&Array.isArray(session?.events))return session.events;
  fail('SESSION_EVENTS_UNAVAILABLE');
}

export function sessionEventAt(session,seq){
  if(typeof session?.snapshotEvents==='function'){
    if(typeof session.eventAt!=='function')fail('SESSION_EVENTS_UNAVAILABLE');
    return session.eventAt(seq);
  }
  return sessionEvents(session)[seq];
}

export function sessionReplacement(session,seq){
  // Capability selection happens before append. Never retry a failed native
  // mutation with another coordinate convention or hide validation failures.
  if(typeof session?.snapshotEvents==='function')return {op:'replace',startSeq:seq,endSeq:seq};
  sessionEvents(session);
  return {op:'replace',start:seq,end:seq};
}
