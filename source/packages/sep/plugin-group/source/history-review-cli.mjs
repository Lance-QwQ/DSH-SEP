#!/usr/bin/env node
import {isAbsolute} from 'node:path';
import {parseArgs} from 'node:util';
import {Context} from '@deepseek-ai/cordis';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import {readSessionReview} from './history-review.mjs';
import {currentGenerationIdentity} from './history-generation.mjs';
let ctx;
try{
 const {values:v}=parseArgs({strict:true,options:{help:{type:'boolean'},'sessions-root':{type:'string'},project:{type:'string'},session:{type:'string'},summary:{type:'string'},source:{type:'string'},revision:{type:'string'},offset:{type:'string'},limit:{type:'string'},compression:{type:'string',default:'zstd'}}});
 if(v.help){console.log('dsh-sep-history --sessions-root <absolute existing root> --project <absolute project> --session <id> [--summary <seq>] [--source <seq> --revision <from listing>] [--offset <n> --limit <1..8192>] [--compression none|zstd]\nRead-only human audit; no model context or memory writes.');}
 else{
   if(!isAbsolute(v['sessions-root']??'')||!v.project||!v.session||!['none','zstd'].includes(v.compression))throw Error('REVIEW_ARGUMENTS');
   const physical=await currentGenerationIdentity(v['sessions-root'],v.session,v.compression);
   ctx=new Context();await ctx.plugin(JsonlSessionPersistence,{root:v['sessions-root'],requireExistingRoot:true,compression:v.compression});
   const number=(name)=>v[name]===undefined?undefined:/^(0|[1-9][0-9]*)$/.test(v[name])?Number(v[name]):NaN;
   const result=await readSessionReview(ctx.sessionPersistence,{projectRoot:v.project,sessionId:v.session,summarySeq:number('summary'),sourceSeq:number('source'),expectedRevision:v.revision,offset:number('offset'),limit:number('limit'),signal:AbortSignal.timeout(10000)});
   if(await currentGenerationIdentity(v['sessions-root'],v.session,v.compression)!==physical)throw Error('REVIEW_STALE');
   console.log(JSON.stringify(result,null,2));
 }
}catch(error){console.error(JSON.stringify({status:'error',code:/^REVIEW_[A-Z_]+$/.test(error.message)?error.message:'REVIEW_READ_FAILED'}));process.exitCode=1;}
finally{await ctx?.fiber.dispose();}
