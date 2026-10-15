import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {runLcmMigrations} from '../vendor/lossless-claw/db/migration.js';
import {ConversationStore} from '../vendor/lossless-claw/store/conversation-store.js';
import {SummaryStore} from '../vendor/lossless-claw/store/summary-store.js';
import {estimateTokens} from '../vendor/lossless-claw/estimate-tokens.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
let db;
try{
  db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');runLcmMigrations(db);
  const conversations=new ConversationStore(db),summaries=new SummaryStore(db);
  const conversation=await conversations.createConversation({sessionId:randomUUID(),sessionKey:workerData.projectId}),ids=[];
  for(const [seq,content] of workerData.records.entries()){
    const message=JSON.parse(content),role=message.role??message.type;
    if(!['system','user','assistant','tool'].includes(role))throw Error('ROLE');
    const row=await conversations.createMessage({conversationId:conversation.conversationId,seq,role,content,tokenCount:estimateTokens(content)});ids.push(row.messageId);
  }
  const summaryId=randomUUID();await summaries.insertSummary({summaryId,conversationId:conversation.conversationId,kind:'leaf',content:workerData.summary,tokenCount:estimateTokens(workerData.summary),model:'native-host-summarizer'});
  await summaries.linkSummaryToMessages(summaryId,ids);
  const linked=await summaries.getSummaryMessages(summaryId);
  const recovered=linked.map(id=>db.prepare('SELECT content FROM messages WHERE message_id=?').get(id).content);
  if(JSON.stringify(recovered)!==JSON.stringify(workerData.records))throw Error('COVERAGE');
  const saved=db.prepare('SELECT content FROM summaries WHERE summary_id=?').get(summaryId).content;
  if(saved!==workerData.summary)throw Error('SUMMARY');
  parentPort.postMessage({ok:true,receipt:{engine:'lossless-claw-summary-store',sourceHash:hash(JSON.stringify(recovered)),summaryHash:hash(saved),messageCount:linked.length,persisted:false}});
}catch{parentPort.postMessage({ok:false});}finally{db?.close();}
