import {randomUUID} from 'node:crypto';
import {checkAbort} from './errors.js';
import {sessionEvents,sessionEventAt,sessionReplacement} from './session-events.js';

const MEMORY_PRODUCER='dsh-system-enhancement-package/memory';
const RETIREMENT_PRODUCER='dsh-system-enhancement-package/memory-context';
const RETIRED_CONTEXT='[Previous suite memory context retired.]';
const RETIRED_ARCHIVE='[Archive result retired after its authorized turn.]';
const ownContext=message=>message?.role==='user'&&message.source?.kind==='plugin'&&message.source.plugin===MEMORY_PRODUCER&&['snapshot','notice'].includes(message.source.form);
const retiredArchive=message=>message.content[0]?.content?.length===1&&message.content[0].content[0].type==='text'&&message.content[0].content[0].text===RETIRED_ARCHIVE;

/**
 * Retire suite-generated memory from the native, durable model surface.
 * Install only with four-layer memory enabled. Recall must publish a fresh
 * snapshot on every entered step: the prepend hook retires prior snapshots
 * before compaction/recall hooks run, without touching their decision.messages.
 * Public session replacements preserve the append-only human/audit transcript.
 */
export async function installMemoryContext(ctx,{scope,signal=new AbortController().signal,track=work=>work,historyAllowed,archiveTools=['suite_memory_archive_search','suite_memory_archive_get','suite_history_expand']}){
  const archiveNames=new Set(archiveTools);
  const authorized=new Map();
  const emptyCounters=()=>({retiredContexts:0,retiredArchiveResults:0,blockedCompactions:0,lastError:null});
  const counters=emptyCounters(),projectCounters=new Map();
  const scopedCounters=session=>projectCounters.get(authorized.get(session.id)?.project.key);
  function increment(session,field){counters[field]++;const local=scopedCounters(session);if(local)local[field]++;}

  async function authorize(agent,requestSignal){
    if(!agent)return false;
    const combined=AbortSignal.any([signal,...(requestSignal?[requestSignal]:[])]);
    checkAbort(combined);
    try{
      const project=await scope.caller({agent,signal:combined});
      authorized.set(agent.session.id,{session:agent.session,project});
      if(!projectCounters.has(project.key))projectCounters.set(project.key,emptyCounters());
      return true;
    }catch(error){if(error.code==='UNAUTHORIZED'){authorized.delete(agent.session.id);return false;}throw error;}
  }
  function archiveCalls(session){
    return new Set(sessionEvents(session).filter(event=>event.type==='tool/call'&&archiveNames.has(event.data.name)).map(event=>event.data.callId));
  }
  function retire(session,{turn,all=false}={}){
    const calls=archiveCalls(session);
    // Replacements are themselves append-only events. Snapshot the current
    // node list so replacements cannot change this traversal beneath us.
    for(const seq of [...session.surface.nodes]){
      const event=sessionEventAt(session,seq);
      const provenance={surfaceOp:sessionReplacement(session,seq),sourceEventSeqs:[seq]};
      if(event.type==='user/message'&&ownContext(event.data)){
        session.append('user/message',{id:randomUUID(),role:'user',content:[{type:'text',text:RETIRED_CONTEXT}],source:{kind:'plugin',plugin:RETIREMENT_PRODUCER,form:'notice',summary:'Previous memory context retired'}},provenance);
        increment(session,'retiredContexts');
      }else if(event.type==='tool/result'&&(all||event.data.turn!==turn)&&calls.has(event.data.message.source.callId)&&!retiredArchive(event.data.message)){
        // The native tool/result replacement contract permits changing only
        // its body; retain message/call identity, error flags, and tool metadata.
        const data=JSON.parse(JSON.stringify(event.data));
        data.message.content[0].content=[{type:'text',text:RETIRED_ARCHIVE}];
        session.append('tool/result',data,provenance);
        increment(session,'retiredArchiveResults');
      }
    }
  }

  ctx.on('agent/pre-step',async(payload,next)=>track((async()=>{
    if(await authorize(payload.agent,payload.signal))retire(payload.agent.session,{turn:payload.turn});
    return next();
  })()),{prepend:true});

  ctx.on('agent/status',({agent,status})=>{
    const session=agent.session;
    if(status!=='idle'||!authorized.has(session.id))return;
    // Session append observers prohibit reentrant append. The native idle
    // boundary is after turn/end publication and before whenIdle resolves.
    // The pre-step path reattempts retirement if this observer ever fails.
    try{retire(session,{all:true});}
    catch(error){counters.lastError=error.code??'MEMORY_CONTEXT_RETIREMENT_FAILED';const local=scopedCounters(session);if(local)local.lastError=counters.lastError;throw error;}
  },{prepend:true});
  ctx.on('session/disposed',session=>authorized.delete(session.id));
  ctx.effect(()=>()=>{authorized.clear();projectCounters.clear();});

  ctx.on('llm/stream',async function*(options,next){
    if(historyAllowed&&options.sessionId){
      const agent=ctx.get('agents')?.get(options.sessionId),session=agent?.session;
      if(session){
        const calls=new Set(sessionEvents(session).filter(e=>e.type==='tool/call'&&e.data.name==='suite_history_expand').map(e=>e.data.callId));
        const expanded=options.messages.filter(m=>m.source?.kind==='tool'&&calls.has(m.source.callId)&&!retiredArchive(m));
        if(expanded.length)await historyAllowed(agent,expanded);
      }
    }
    if(options.purpose==='compaction'){
      let session=authorized.get(options.sessionId)?.session;
      if(!session){
        const agent=ctx.get('agents')?.get(options.sessionId);
        if(await authorize(agent,options.signal))session=agent.session;
      }
      if(session){
        const calls=archiveCalls(session);
        const ephemeral=options.messages.some(message=>ownContext(message)||(message.source?.kind==='tool'&&calls.has(message.source.callId)&&!retiredArchive(message)));
        if(ephemeral){
          increment(session,'blockedCompactions');
          throw Object.assign(new Error('MEMORY_CONTEXT_COMPACTION_BLOCKED: active suite memory must not become a persistent checkpoint; retry after the authorized turn ends.'),{code:'MEMORY_CONTEXT_COMPACTION_BLOCKED'});
        }
      }
    }
    yield* next();
  },{prepend:true});
  return {status:project=>{
    // Only trusted caller projects may select a namespace. The no-argument
    // aggregate is for internal diagnostics, never a caller-facing status tool.
    if(project===undefined)return {...counters};
    if(!scope.projects.includes(project))throw Object.assign(new Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});
    return {...(projectCounters.get(project.key)??emptyCounters())};
  }};
}
