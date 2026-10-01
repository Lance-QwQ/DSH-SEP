import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { BudgetDefaults, BudgetList, BudgetSettingsApi, BudgetSnapshot } from '../budget-protocol.ts';
const codes=new Set(['BUDGET_SETTINGS_CONFLICT','BUDGET_SETTINGS_SESSION','BUDGET_SETTINGS_INPUT','BUDGET_SETTINGS_UNAVAILABLE','BUDGET_LEDGER_MISSING', 'BUDGET_LEDGER_CHANGED', 'BUDGET_LOCKED','ABORTED','DISPOSED']);
const safe=(value:unknown)=>typeof value==='string'&&codes.has(value)?value:'BUDGET_SETTINGS_UNAVAILABLE';
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
const amount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value);
const nonnegative=(value:unknown)=>amount(value)&&(value as number)>=0;
const limit=(value:unknown)=>amount(value)&&(value as number)>=.01&&(value as number)<=1000000&&Math.abs((value as number)*100-Math.round((value as number)*100))<.000001;
const revision=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0;
const text=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=4096;
function invalid():never{throw new Error('BUDGET_SETTINGS_RESPONSE');}
function defaults(value:unknown):BudgetDefaults{if(!record(value)||!limit(value.limitCny)||!revision(value.revision))return invalid();return value as unknown as BudgetDefaults;}
function snapshot(value:unknown,sessionId:string):BudgetSnapshot{
 if(!record(value)||value.version!==1||value.rootSessionId!==sessionId||!limit(value.limitCny)||!revision(value.revision)||typeof value.usesDefault!=='boolean'||value.isProviderInvoice!==false||!amount(value.remainingCny)||!['accountedUpperBoundCny','settledCny','reservedCny','unattributedSharedCny'].every(key=>nonnegative(value[key])))return invalid();
 return value as unknown as BudgetSnapshot;
}
function list(value:unknown):BudgetList{
 if(!record(value)||value.version!==1||typeof value.available!=='boolean'||!(value.reason===null||typeof value.reason==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value.reason)))return invalid();
 if(!value.available){if(!Array.isArray(value.sessions)||value.sessions.length!==0)return invalid();return {version:1,available:false,reason:value.reason as string|null,sessions:[]};}
 if(!record(value.shared)||!nonnegative(value.shared.limitCny)||!nonnegative(value.shared.accountedUpperBoundCny)||!amount(value.shared.remainingCny)||!nonnegative(value.taskLimitCny)||!Array.isArray(value.sessions)||value.sessions.length>10000)return invalid();
 defaults(value.defaults);const ids=new Set<string>();for(const row of value.sessions){if(!record(row)||!text(row.id)||!text(row.label)||ids.has(row.id as string))return invalid();ids.add(row.id as string);}
 return value as unknown as BudgetList;
}
export function createBudgetSettingsApi(rpc:ClientConnectionRpc):BudgetSettingsApi{
 const call=async(method:string,payload:unknown,signal?:AbortSignal):Promise<unknown>=>{const result=await rpc.call('/api','sep-budget/'+method,payload,signal);if(!result.ok)throw new Error(safe(result.error.message));return result.value;};
 return {list:async signal=>list(await call('list',{},signal)),get:async(sessionId,signal)=>snapshot(await call('get',{sessionId},signal),sessionId),update:async(sessionId,limitCny,expectedRevision,signal)=>snapshot(await call('update',{sessionId,limitCny,expectedRevision},signal),sessionId),updateDefault:async(limitCny,expectedRevision,signal)=>defaults(await call('updateDefault',{limitCny,expectedRevision},signal))};
}
