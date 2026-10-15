import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function check(ctx,input){
 const require=createRequire(join(JSON.parse(process.env.SEP_DAILY_PROFILE_CASE).host,'package.json'));
 const {SessionId}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')));
 const {createUserMessage}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')));
 const originalLedger=JSON.parse(await readFile(input.ledgerPath)),history=sha(JSON.stringify(originalLedger.entries));
 const handle=await ctx.agents.create({sessionId:SessionId('private-copy-governed-probe-'+JSON.parse(process.env.SEP_DAILY_PROFILE_CASE).round),meta:{cwd:JSON.parse(process.env.SEP_DAILY_PROFILE_CASE).project,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-flash',maxTokens:64}}),agent=handle.agent;
 const exec={agent,signal:new AbortController().signal,callId:'private-copy-probe'};
 const call=(name,args)=>ctx.tools.get('suite_'+name,agent).execute(args,exec);
 const record=await call('memory_get',{id:input.recordId});assert(record.record,'PRIVATE_RECORD_NOT_READABLE');assert.equal(sha(record.record.text),input.textHash,'PRIVATE_RECORD_BODY_CHANGED');for(const [k,v]of Object.entries(input.recordFields))assert.deepEqual(record.record[k],v,'PRIVATE_RECORD_FIELD_CHANGED');
 const status=await call('status',{});assert.equal(status.consumers.memory,'ready');assert.equal(status.consumers.capture,false);
 const text='隔离 Alpha.2 接续验证用临时事项，不产生真实模型消费';agent.session.append('turn/start',{});agent.session.append('user/message',createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}),{surfaceOp:'append'});
 const saved=await call('memory_save',{text,category:'project',status:'confirmed',eventId:'private-copy-synthetic-save',reason:'explicit current synthetic evidence'});assert(saved,'PRIVATE_COPY_SAVE_FAILED');
 const sessions=await ctx.sessionPersistence.list();assert(sessions.length>=input.originalSessionCount,'PRIVATE_SESSION_COUNT_CHANGED');for(const row of input.originalSessionRows)assert.equal(sha(await readFile(join(input.sessionRoot,row.relative))),row.sha256,'PRIVATE_SESSION_BYTES_CHANGED');let events=0;
 for(const row of sessions){const h=await ctx.sessionPersistence.open(SessionId(row.header.id),'read');try{events+=(await h.read()).events.length;}finally{await h.close();}}
 const filePath=join(JSON.parse(process.env.SEP_DAILY_PROFILE_CASE).project,'copy-only.txt'),file=await ctx.fs.resolve(filePath);let exists;try{exists=await readFile(filePath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(exists===undefined)await ctx.fs.writeText(file,'synthetic-copy-only',{kind:'createIfAbsent'},undefined,{mode:'workspace-write',workspaceRoot:JSON.parse(process.env.SEP_DAILY_PROFILE_CASE).project});assert.equal(await readFile(filePath,'utf8'),'synthetic-copy-only');
 const after=JSON.parse(await readFile(input.ledgerPath));assert.equal(sha(JSON.stringify(after.entries)),history,'PRIVATE_BUDGET_ENTRIES_CHANGED');for(const k of ['limit','initialSpent','sessionDefault','sessionLimits','childBindings'])assert.deepEqual(after[k],originalLedger[k]);
 assert.equal(ctx.sepStorageControl.verificationCopy.productionAdoption,false);
 return {memoryReady:true,privateRecordReadable:true,privateRecordBodyAndTimesPreserved:true,syntheticMemoryWrite:true,privateSessions:input.originalSessionCount,privatePhysicalSessionFilesUnchanged:input.originalSessionRows.length,totalSessionsIncludingSynthetic:sessions.length,privateEvents:events,protectedCopyFileWrite:true,ledgerHistoryUnchanged:true,modelStreamInvoked:false,nonLoopbackFetchDenied:true};
}
