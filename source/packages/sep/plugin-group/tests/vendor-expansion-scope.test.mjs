import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runLcmMigrations} from '../vendor/lossless-claw/db/migration.js';
import {ConversationStore} from '../vendor/lossless-claw/store/conversation-store.js';
import {SummaryStore} from '../vendor/lossless-claw/store/summary-store.js';
import {RetrievalEngine} from '../vendor/lossless-claw/retrieval.js';
import {ExpansionAuthManager} from '../vendor/lossless-claw/expansion-auth.js';
async function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');runLcmMigrations(db);
 const conversations=new ConversationStore(db),summaries=new SummaryStore(db),retrieval=new RetrievalEngine(conversations,summaries);
 const a=(await conversations.createConversation({sessionId:'session-a'})).conversationId,b=(await conversations.createConversation({sessionId:'session-b'})).conversationId;
 const messageA=await conversations.createMessage({conversationId:a,seq:0,role:'user',content:'SYNTHETIC_A',tokenCount:4});
 const messageB=await conversations.createMessage({conversationId:b,seq:0,role:'user',content:'SYNTHETIC_B',tokenCount:4});
 await summaries.insertSummary({summaryId:'sum_a',conversationId:a,kind:'leaf',content:'A summary',tokenCount:2,model:'synthetic'});
 await summaries.insertSummary({summaryId:'sum_b',conversationId:b,kind:'leaf',content:'B summary',tokenCount:2,model:'synthetic'});
 await summaries.linkSummaryToMessages('sum_a',[messageA.messageId]);await summaries.linkSummaryToMessages('sum_b',[messageB.messageId]);
 return {a,b,messageA,messageB,retrieval,summaries};
}
const scopedError={code:'LCM_EXPANSION_SCOPE'};
test('retrieval refuses a foreign root summary despite the requested conversation ID',async t=>{
 const f=await fixture(t);await assert.rejects(f.retrieval.expand({summaryId:'sum_b',conversationId:f.a,includeMessages:true}),scopedError);
});
test('retrieval refuses a foreign descendant summary before returning its content',async t=>{
 const f=await fixture(t);await f.summaries.insertSummary({summaryId:'sum_root',conversationId:f.a,kind:'condensed',depth:1,content:'root',tokenCount:2,model:'synthetic'});await f.summaries.linkSummaryToParents('sum_root',['sum_b']);
 await assert.rejects(f.retrieval.expand({summaryId:'sum_root',conversationId:f.a,depth:1}),scopedError);
});
test('retrieval refuses a foreign message linked to an otherwise permitted leaf',async t=>{
 const f=await fixture(t);await f.summaries.linkSummaryToMessages('sum_a',[f.messageB.messageId]);
 await assert.rejects(f.retrieval.expand({summaryId:'sum_a',conversationId:f.a,includeMessages:true}),scopedError);
});
test('retrieval requires an explicit conversation and preserves scoped successful content',async t=>{
 const f=await fixture(t);await assert.rejects(f.retrieval.expand({summaryId:'sum_a',includeMessages:true}),scopedError);
 const result=await f.retrieval.expand({summaryId:'sum_a',conversationId:f.a,includeMessages:true});assert.deepEqual(result.messages.map(m=>m.content),['SYNTHETIC_A']);
});
test('empty summary allowlist retains conversation-wide semantics used by delegated query grants',()=>{
 const auth=new ExpansionAuthManager();const grant=auth.createGrant({issuerSessionId:'synthetic',allowedConversationIds:[1]});
 assert.equal(auth.validateExpansion(grant.grantId,{conversationId:1,summaryIds:['sum_a']}).valid,true);
 assert.equal(auth.validateExpansion(grant.grantId,{conversationId:2,summaryIds:['sum_a']}).valid,false);
 const exact=auth.createGrant({issuerSessionId:'synthetic',allowedConversationIds:[1],allowedSummaryIds:['sum_a']});
 assert.equal(auth.validateExpansion(exact.grantId,{conversationId:1,summaryIds:['sum_b']}).valid,false);
});