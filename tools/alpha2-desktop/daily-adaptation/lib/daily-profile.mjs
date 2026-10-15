import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const fail=code=>{throw Object.assign(Error(code),{code});};
const retired=new Set(['sep-checkpoint','sep-memory-ui','sep-worker','sep-suite','sep-safe-change','sep-plugin-group','sep-lossless-compaction','sep-context-preparation','sep-evaluation-entry','sep-computer-click','sep-brand','sep-recovery-host','sep-continuation']);
/** Pure cold-profile conversion. Unrelated rows retain their exact values.
 * Does not read, initialize, clear, migrate or write any selected data domain.
 * The caller must bind source bytes, effective presets and resulting files. */
export function buildProfileSelection({programRoot,project,roots,budgetPath,savedSourceRoot,suite,patches}){
 if(!Array.isArray(patches)||!suite?.p1?.enabled||!suite.projects?.[0]?.sources?.length||!project?.id)fail('SEP_DAILY_PROFILE_INPUT');
 const indexed=new Map();for(const row of patches)if(row.id){if(indexed.has(row.id))fail('SEP_DAILY_PROFILE_AMBIGUOUS');indexed.set(row.id,row);}
 const fs=indexed.get('fs-sandbox'),runner=indexed.get('cordis-host-runner');
 if(!fs?.config?.recovery||!runner?.config?.persistence||!indexed.has('storage-json')||!indexed.has('session-persistence-jsonl'))fail('SEP_DAILY_PROFILE_INPUT');
 const captureModel=suite.memoryAutomation?.model??suite.p1.model;
 // The shared vision/capture consumer currently accepts one auxiliary model.
 // Refuse a different configured vision model instead of silently changing it.
 if(suite.vision&&suite.vision.model!==captureModel)fail('SEP_DAILY_VISION_MODEL');
 const output=[];for(const source of patches){
  const row=structuredClone(source);
  if(row.insert){row.insert=row.insert.filter(child=>!retired.has(child.id));if(!row.insert.length)continue;}
  if(retired.has(row.id))continue;
  if(row.id==='fs-sandbox'||row.id==='session-persistence-jsonl')row.disabled=true;
  if(row.id==='storage-json')row.config={...row.config,root:roots.memory};
  if(row.id==='cordis-host-runner')row.config.persistence={...row.config.persistence,root:savedSourceRoot,projectRoot:project.root};
  output.push(row);
 }
 const core=join(programRoot,'node_modules/dsh-sep-bundle'),recovery=join(programRoot,'node_modules/@deepseek-ai/dsh-recovery');
 const url=path=>pathToFileURL(path).href,nativeEntryKey='sep-daily-native';
 const capture=suite.memoryAutomation?.capture??false,recall=suite.memoryAutomation?.recall??true;
 output.push(...['attachment-local','desktop-product-telemetry','product-analytics','session-telemetry-otel','otel'].map(id=>({id,disabled:true})));
 output.push({id:'sandbox-policy',config:{mode:'workspace-write',workspaceRoot:project.root}});
 output.push({insert:[
  {id:nativeEntryKey,name:'@deepseek-ai/dsh-compaction-basic',config:{auto:true,thresholdRatio:.08,retainRatio:.016,maxTokens:8192,compactionRetries:0,maxOverflowRetries:2}},
  {id:'sep-brand',name:url(join(programRoot,'node_modules/dsh-sep-brand/lib/index.js')),config:{}},
  {id:'sep-recovery-host',name:url(join(recovery,'src/host-plugin.mjs')),config:{registerSelectedWorkspaces:true}},
  {id:'sep-continuation',name:url(join(recovery,'src/desktop-continuation.mjs')),config:{}},
  ...(suite.vision?[{id:'sep-daily-attachments',name:url(join(core,'bundle/lib/native-attachments.js')),config:{storageRoot:roots.memory,projectId:project.id}}]:[])
 ]});
 const {root:_backupRoot,...recoveryPolicy}=fs.config.recovery;
 return {patches:output,nativeEntryKey,retiredIds:[...retired],runtime:{
  profile:{selection:{projectId:project.id,roots:structuredClone(roots),budgetPath,credentialRef:'DEEPSEEK_API_KEY'},recovery:recoveryPolicy,session:{compression:indexed.get('session-persistence-jsonl').config?.compression??'none'}},
  p1:{...structuredClone(suite.p1),budgetPath,initialSpentCny:0},
  business:{sources:[...suite.projects[0].sources],...(suite.projects[0].userProfile?{userProfile:suite.projects[0].userProfile}:{}),capture,recall,captureModel,media:suite.modules?.media??false,pluginGroup:true,click:{enabled:true,serverName:'sep_windows'},...(suite.vision?{vision:{enabled:true,allowUpload:true}}:{})},
  compaction:{},shutdownMs:30000
 }};
}
