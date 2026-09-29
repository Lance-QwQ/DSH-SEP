import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { BudgetList, BudgetSnapshot, BudgetSettingsApi } from '../budget-protocol.ts';
import type { BudgetLocaleKey } from './budget-locales.ts';
import css from './BudgetSettingsSection.module.css';
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'settings.sepBudget': BudgetLocaleKey } }
export interface BudgetSettingsSectionInjected { readonly api: BudgetSettingsApi; readonly requestTimeoutMs: number; readonly hooks: { readonly connection: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } } }
export type BudgetSettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.sepBudget'> & InjectFace<BudgetSettingsSectionInjected>;
type Notice = 'readError' | 'unconfirmed' | 'conflict' | 'saved' | 'ledgerMissing' | 'ledgerChanged' | null;
function ledgerNotice(error: unknown): 'ledgerMissing' | 'ledgerChanged' | null {
 if (!(error instanceof Error)) return null;
 return error.message==='BUDGET_LEDGER_MISSING'?'ledgerMissing':error.message==='BUDGET_LEDGER_CHANGED'?'ledgerChanged':null;
}
export function parseLimit(input: string): number | null {
 if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
 const value=Number(input);return Number.isFinite(value)&&value>=.01&&value<=1000000?value:null;
}
function money(value: number): string { return value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6}); }
/** Bounded waiting never implies a timed-out mutation was not committed. */
function request<T>(fn: (signal: AbortSignal)=>Promise<T>, parent: AbortSignal, timeout: number): Promise<T> {
 const controller=new AbortController();let timer: ReturnType<typeof setTimeout>;
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>{controller.abort();cleanup();reject(new Error('ABORTED'));};
  const cleanup=()=>{clearTimeout(timer);parent.removeEventListener('abort',abort);};
  parent.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{controller.abort();cleanup();reject(new Error('TIMEOUT'));},timeout);
  if(parent.aborted){abort();cleanup();return;}
  Promise.resolve().then(()=>fn(controller.signal)).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
 });
}
/** Defaults and window overrides are independent CAS writes; reads are authoritative. */
export function BudgetSettingsSection({api,requestTimeoutMs,useConnection,t}:BudgetSettingsSectionProps): ReactNode {
 const id=useId(),generation=useConnection(value=>value);
 const [catalog,setCatalog]=useState<BudgetList|null>(null),[snapshot,setSnapshot]=useState<BudgetSnapshot|null>(null);
 const [sessionId,setSessionId]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [defaultInput,setDefaultInput]=useState('100'),[limitInput,setLimitInput]=useState('100'),[notice,setNotice]=useState<Notice>(null);
 const [confirmedAt,setConfirmedAt]=useState<number|null>(null);
 const pending=useRef(false),mounted=useRef(true),read=useRef<AbortController|null>(null),write=useRef<AbortController|null>(null),selection=useRef('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;read.current?.abort();write.current?.abort();};},[]);
 useEffect(()=>{
  if(pending.current)return;
  const controller=new AbortController();read.current?.abort();read.current=controller;setLoading(true);setSnapshot(null);setCatalog(null);
  void (async()=>{
   try{
    const list=await request(signal=>api.list(signal),controller.signal,requestTimeoutMs);
    if(controller.signal.aborted)return;
    const selected=list.sessions.some(value=>value.id===selection.current)?selection.current:list.sessions[0]?.id??'';
    const value=list.available&&selected?await request(signal=>api.get(selected,signal),controller.signal,requestTimeoutMs):null;
    if(controller.signal.aborted)return;
    selection.current=selected;setSessionId(selected);setCatalog(list);setSnapshot(value);setDefaultInput(String(list.available?list.defaults.limitCny:100));setLimitInput(String(value?.limitCny??(list.available?list.defaults.limitCny:100)));setConfirmedAt(Date.now());
   }catch(error){if(!controller.signal.aborted){setCatalog(null);setSnapshot(null);setNotice(ledgerNotice(error)??'readError');}}
   finally{if(!controller.signal.aborted)setLoading(false);}
  })();
  return()=>controller.abort();
 },[api,generation,refresh,requestTimeoutMs]);
 async function save(isDefault:boolean):Promise<void>{
  const value=parseLimit(isDefault?defaultInput:limitInput);
  if(pending.current||loading||!catalog?.available||value===null||(!isDefault&&!snapshot))return;
  pending.current=true;setSaving(true);setNotice(null);read.current?.abort();const controller=new AbortController();write.current=controller;
  const selected=snapshot?.rootSessionId,revision=isDefault?catalog.defaults.revision:snapshot!.revision;
  try{
   await request(signal=>isDefault?api.updateDefault(value,revision,signal):api.update(selected!,value,revision,signal),controller.signal,requestTimeoutMs);
   if(mounted.current&&!controller.signal.aborted)setNotice('saved');
  }catch(error){if(mounted.current&&!controller.signal.aborted)setNotice(ledgerNotice(error)??(error instanceof Error&&error.message==='BUDGET_SETTINGS_CONFLICT'?'conflict':'unconfirmed'));}
  finally{pending.current=false;if(mounted.current){setSaving(false);setRefresh(value=>value+1);}}
 }
 const disabled=loading||saving,defaultValue=parseLimit(defaultInput),sessionValue=parseLimit(limitInput);
 return <section className={css.section} aria-busy={disabled}>
  <div className={css.heading}><h2>{t('title')}</h2><button type="button" onClick={()=>{setNotice(null);setRefresh(value=>value+1);}} disabled={saving}>{t('refresh')}</button></div>
  <p>{t('description')}</p><p className={css.notice}>{t('notInvoice')}</p>
  {notice?<p role={notice==='saved'?'status':'alert'}>{t(notice)}</p>:null}
  {loading?<p role="status">{t('loading')}</p>:null}
  {!loading&&catalog&&!catalog.available?<p role="status">{t('unavailable')} {catalog.reason}</p>:null}
  {catalog?.available?<>
   <div className={css.box}><label htmlFor={id+'-default'}>{t('defaultLimit')}</label>
    <input id={id+'-default'} name="defaultLimit" type="number" min="0.01" max="1000000" step="0.01" value={defaultInput} onChange={event=>setDefaultInput(event.target.value)} disabled={disabled}/>
    <p>{t('defaultHelp')}</p><p>{t('range')}</p>
    <button type="button" disabled={disabled||defaultValue===null||defaultValue===catalog.defaults.limitCny} onClick={()=>void save(true)}>{t('saveDefault')}</button>
   </div>
   <div className={css.box}><label htmlFor={id+'-session'}>{t('session')}</label>
    <select id={id+'-session'} value={sessionId} disabled={disabled||!catalog.sessions.length} onChange={event=>{selection.current=event.target.value;setSessionId(event.target.value);setNotice(null);setRefresh(value=>value+1);}}>
     {catalog.sessions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {!catalog.sessions.length?<p>{t('noSessions')}</p>:null}
    {snapshot?<><code>{snapshot.rootSessionId}</code><p>{t(snapshot.usesDefault?'usesDefault':'override')}</p>
     <label htmlFor={id+'-limit'}>{t('sessionLimit')}</label><input id={id+'-limit'} name="sessionLimit" type="number" min="0.01" max="1000000" step="0.01" value={limitInput} onChange={event=>setLimitInput(event.target.value)} disabled={disabled}/>
     <button type="button" disabled={disabled||sessionValue===null||sessionValue===snapshot.limitCny&&!snapshot.usesDefault} onClick={()=>void save(false)}>{t('saveSession')}</button>
     <dl><dt>{t('accounted')}</dt><dd>¥ {money(snapshot.accountedUpperBoundCny)}</dd><dt>{t('settled')}</dt><dd>¥ {money(snapshot.settledCny)}</dd><dt>{t('reserved')}</dt><dd>¥ {money(snapshot.reservedCny)}</dd><dt>{t('remaining')}</dt><dd>¥ {money(snapshot.remainingCny)}</dd><dt>{t('unattributed')}</dt><dd>¥ {money(snapshot.unattributedSharedCny)}</dd></dl>
    </>:null}
   </div>
   <div className={css.box}><p>{t('sharedGuard')}: ¥ {money(catalog.shared.limitCny)} · {t('remaining')}: ¥ {money(catalog.shared.remainingCny)}</p><p>{t('taskGuard')}: ¥ {money(catalog.taskLimitCny)}</p><p>{t('independent')}</p></div>
   <p className={css.notice}>{t('retained')}</p><p className={css.notice}>{t('unknown')}</p>
   {confirmedAt?<small>{t('confirmed')}: {new Date(confirmedAt).toLocaleString()}</small>:null}
  </>:null}
 </section>;
}
