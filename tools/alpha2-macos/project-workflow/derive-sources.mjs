import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Object.assign(new Error('SEP_MAC_WORKFLOW_ORIGIN_CHANGED'),{code:'SEP_MAC_WORKFLOW_ORIGIN_CHANGED'});};
const BASE={core:'a98d2ecbc7148815959d97a4b4c20085dbc3a46bb377f9ed830cec0faae90ea8',lifecycle:'480368fdca5cc301a38fb3f8bd894d7b84c94c1248cfbd1f62cb13a77d22c844'};
const additions=`   listGenerations(input){return exclusive(async()=>{
    if(!input||Object.keys(input).sort().join(',')!=='after,limit'||!Number.isSafeInteger(input.after)||input.after<0||!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>32)fail('SEP_MAC_WORKFLOW_INPUT');
    const m=await ready();await snapshot(m.generation);
    const rows=db.prepare('SELECT id FROM generations WHERE id>? ORDER BY id LIMIT ?').all(input.after,input.limit+1),items=[];
    for(const row of rows.slice(0,input.limit)){const value=await snapshot(row.id);items.push({generation:row.id,current:row.id===m.generation,sha256:value.sha256});}
    return {items,nextAfter:rows.length>input.limit?items.at(-1).generation:null};
   });},
   inspectPlan(input){return exclusive(async internal=>{
    if(!input||Object.keys(input).sort().join(',')!=='planHash,signal'||!input.signal||typeof input.signal.aborted!=='boolean')fail('SEP_MAC_WORKFLOW_INPUT');
    const signal=AbortSignal.any([input.signal,internal]),cancelled=()=>{if(signal.aborted)fail('SEP_PROJECT_CANCELLED');};
    cancelled();const m=await ready(),t=lookup(input.planHash);
    if(t.state!=='ready'||t.plan.baseGeneration!==m.generation||t.plan.baseSequence!==m.sequence||Date.now()-t.createdAt>=86400000)fail('SEP_PROJECT_STALE_PLAN');
    const baseline=await snapshot(m.generation),candidatePath=join(root,'transactions',t.id,'candidate'),candidate=await tree(candidatePath);
    if(candidate.sha256!==t.candidate.sha256||candidate.version!==t.candidate.version)fail('SEP_PROJECT_CANDIDATE_CHANGED');
    const preview=await previewPlan({before:{path:pathFor(m.generation),...baseline},after:{path:candidatePath,...candidate},changes:t.plan.changes,signal});
    cancelled();const afterBase=await snapshot(m.generation),afterCandidate=await tree(candidatePath),now=await ready();
    if(now.generation!==m.generation||now.sequence!==m.sequence||afterBase.version!==baseline.version)fail('SEP_PROJECT_BASELINE_CHANGED');
    if(afterCandidate.sha256!==candidate.sha256||afterCandidate.version!==candidate.version)fail('SEP_PROJECT_CANDIDATE_CHANGED');
    cancelled();return {plan:{planHash:t.planHash,kind:t.kind,baseGeneration:m.generation,baseSequence:m.sequence,baseSha256:baseline.sha256,targetSha256:candidate.sha256},...preview};
   });},
`;
export function deriveReadonlySources({core,lifecycle}){
 const source={core,lifecycle},outputs={},origin={};
 for(const name of ['core','lifecycle'])if(typeof source[name]!=='string'||sha(source[name])!==BASE[name])fail();
 const transforms={
  core:[
   {before:"import {documentCopies} from './document-copies.mjs';",after:"import {documentCopies} from '../transactions/document-copies.mjs';\nimport {previewPlan} from './preview.mjs';"},
   {before:'   async current(){',after:additions+'   async current(){'}
  ],
  lifecycle:[{before:"const readMethods=new Set(['current','plans','view','review','reviewCleanup','reviewDocument']);",after:"const readMethods=new Set(['current','plans','view','review','reviewCleanup','reviewDocument','listGenerations','inspectPlan']);"}]
 };
 for(const name of ['core','lifecycle']){
  let result=source[name];
  for(const step of transforms[name]){if(result.split(step.before).length!==2)fail();result=result.replace(step.before,step.after);}
  outputs[name]=result;origin[name]={sourceSha256:BASE[name],resultSha256:sha(result),transforms:transforms[name]};
 }
 return {schema:1,outputs,origin};
}
