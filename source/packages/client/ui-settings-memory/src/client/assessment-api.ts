import type {ClientConnectionRpc} from '@deepseek-ai/dsh-client-connection/client';
export type AssessmentStatus='pass'|'fail'|'blocked'|'not_run';
export type AssessmentPhase='detected'|'running'|'complete'|'interrupted';
type Verdict='unknown'|'compatible'|'incompatible';
type Reason='noCandidate'|'staticIncompatible'|'runtime'|'boundEvidence';
export interface AssessmentView {version:1;available:boolean;enabled:boolean;latest:null|{target:string;status:AssessmentStatus;phase:AssessmentPhase;analysis:AssessmentStatus;review:AssessmentStatus;summary:string;reason:string|null;plugins:{name:string;version:string;verdict:Verdict;reasons:Reason[]}[]};usage:null|{reportedRequests:number;promptTokens:number;completionTokens:number;estimatedCny:number;reservedCny:number;isProviderInvoice:false}}
export interface AssessmentApi {get(signal?:AbortSignal):Promise<AssessmentView>;update(enabled:boolean,signal?:AbortSignal):Promise<AssessmentView>;retry(signal?:AbortSignal):Promise<AssessmentView>}
function invalid():never{throw new Error('ASSESSMENT_RESPONSE');}
function object(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))return invalid();return v as Record<string,unknown>;}
function string(v:unknown,max=8000):string{if(typeof v!=='string'||v.length>max)return invalid();return v;}
function number(v:unknown):number{if(typeof v!=='number'||!Number.isFinite(v)||v<0)return invalid();return v;}
function status(v:unknown):AssessmentStatus{if(v==='pass'||v==='fail'||v==='blocked'||v==='not_run')return v;return invalid();}
function phase(v:unknown):AssessmentPhase{if(v==='detected'||v==='running'||v==='complete'||v==='interrupted')return v;return invalid();}
function verdict(v:unknown):Verdict{if(v==='unknown'||v==='compatible'||v==='incompatible')return v;return invalid();}
function reasons(raw:unknown):Reason[]{if(raw===undefined)return ['runtime'];if(!Array.isArray(raw)||raw.length>4)return invalid();return raw.map(v=>{switch(v){case 'NO_CANDIDATE':return 'noCandidate';case 'STATIC_INCOMPATIBLE':return 'staticIncompatible';case 'RUNTIME_UNVERIFIED':return 'runtime';case 'BOUND_RUNTIME_EVIDENCE':return 'boundEvidence';default:return invalid();}});}
function parse(raw:unknown):AssessmentView{
 const v=object(raw);if(v.version!==1||typeof v.available!=='boolean'||typeof v.enabled!=='boolean')return invalid();
 let latest:AssessmentView['latest']=null,usage:AssessmentView['usage']=null;
 if(v.latest!==null){const r=object(v.latest),input=object(r.input),release=object(input.release),a=object(r.analysis),b=object(r.review);if(!Array.isArray(input.plugins)||input.plugins.length>10000)return invalid();
 const summaries=[a.summary,b.summary].filter(x=>x!==undefined).map(x=>string(x,4000));if(b.conflicts!==undefined){if(!Array.isArray(b.conflicts)||b.conflicts.length>30)return invalid();summaries.push(...b.conflicts.map(x=>string(x,1000)));}
 latest={target:string(release.version,80),status:status(r.status),phase:phase(r.phase),analysis:status(a.status),review:status(b.status),summary:summaries.join('\n'),reason:r.reason===undefined||r.reason===null?null:string(r.reason,100),plugins:input.plugins.map(value=>{const p=object(value);return {name:string(p.name,214),version:string(p.version,100),verdict:verdict(p.verdict),reasons:reasons(p.reasonCodes)};})};}
 if(v.usage!==null){const u=object(v.usage);if(u.isProviderInvoice!==false)return invalid();const input=number(u.promptTokens),output=number(u.completionTokens),reportedRequests=number(u.reportedRequests);if(!Number.isSafeInteger(input)||!Number.isSafeInteger(output)||!Number.isSafeInteger(reportedRequests))return invalid();usage={reportedRequests,promptTokens:input,completionTokens:output,estimatedCny:number(u.estimatedCny),reservedCny:number(u.reservedCny),isProviderInvoice:false};}
 return {version:1,available:v.available,enabled:v.enabled,latest,usage};
}
/** Bounded typed projection prevents malformed wire results from becoming compatibility or cost claims. */
export function createAssessmentApi(rpc:ClientConnectionRpc):AssessmentApi{
 const call=async(method:string,payload:unknown,signal?:AbortSignal)=>{const result=await rpc.call('/api','sep-assessment/'+method,payload,signal);if(!result.ok)throw new Error('ASSESSMENT_UNAVAILABLE');return parse(result.value);};
 return {get:signal=>call('get',{},signal),update:(enabled,signal)=>call('update',{enabled},signal),retry:signal=>call('retry',{},signal)};
}
