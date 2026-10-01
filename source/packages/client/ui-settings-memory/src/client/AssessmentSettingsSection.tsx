import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {InjectFace,PropsLocale,PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots';
import type {AssessmentApi,AssessmentView} from './assessment-api.ts';
import type {AssessmentLocaleKey} from './assessment-locales.ts';
import css from './AssessmentSettingsSection.module.css';
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'settings.sepAssessment': AssessmentLocaleKey } }
export interface AssessmentSettingsInjected {readonly api:AssessmentApi;readonly requestTimeoutMs:number;readonly hooks:{readonly connection:{getSnapshot():unknown;subscribe(listener:()=>void):()=>void}}}
type Props=PropsRuntime<'settings.section'> & PropsLocale<'settings.sepAssessment'> & InjectFace<AssessmentSettingsInjected>;
/** Saved state owns the switch; uncertain writes are read back without retrying a paid task. */
export function AssessmentSettingsSection({api,requestTimeoutMs,useConnection,t}:Props):ReactNode {
 const id=useId(),generation=useConnection(v=>v),[state,setState]=useState<AssessmentView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[refresh,setRefresh]=useState(0);
 const operation=useRef<AbortController|null>(null),mounted=useRef(true),writing=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current?.abort();};},[]);
 useEffect(()=>{
  if(writing.current)return;const controller=new AbortController();operation.current?.abort();operation.current=controller;
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(requestTimeoutMs)]);
  void api.get(signal).then(value=>{if(!controller.signal.aborted&&mounted.current){setState(value);setError(false);}},()=>{if(!controller.signal.aborted&&mounted.current)setError(true);});
  const timer=setTimeout(()=>setRefresh(v=>v+1),5000);
  return()=>{controller.abort();clearTimeout(timer);};
 },[api,generation,refresh,requestTimeoutMs]);
 const mutate=async(enabled?:boolean)=>{
  if(writing.current)return;writing.current=true;setBusy(true);operation.current?.abort();const controller=new AbortController();operation.current=controller;
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(requestTimeoutMs)]);
  try{const value=enabled===undefined?await api.retry(signal):await api.update(enabled,signal);if(mounted.current){setState(value);setError(false);}}
  catch{if(mounted.current)setError(true);}
  finally{writing.current=false;if(mounted.current){setBusy(false);setRefresh(v=>v+1);}}
 };
 const latest=state?.latest,usage=state?.usage,rediscoveryRequired=latest?.reason==='ASSESSMENT_REDISCOVERY_REQUIRED';
 return <section className={css.section} aria-labelledby={id} aria-busy={busy}>
  <div className={css.heading}><h2 id={id}>{t('title')}</h2><button disabled={busy} onClick={()=>setRefresh(v=>v+1)}>{t('refresh')}</button></div>
  <label className={css.switch}><span>{t('enabled')}</span><input type="checkbox" role="switch" aria-label={t('enabled')} aria-describedby={id+'-cost'} checked={state?.enabled??false} disabled={busy||!state?.available||error} onChange={e=>void mutate(e.currentTarget.checked)}/></label>
  <p id={id+'-cost'}>{t('costHelp')}</p><p>{t('stopHelp')}</p>
  {error?<p role="alert">{t('error')}</p>:state&&!state.available?<p role="status">{t('unavailable')}</p>:null}
  {latest?<><dl><dt>{t('target')}</dt><dd>{latest.target}</dd><dt>{t('analysis')}</dt><dd>{t(latest.analysis)}</dd><dt>{t('review')}</dt><dd>{t(latest.review)}</dd></dl><p role="status">{t(latest.phase)} · {t(latest.status)}</p>
   {rediscoveryRequired?<p role="status">{t('rediscoveryRequired')}</p>:null}
   <details><summary>{t('result')}</summary><p>{t('model')}</p><p>{latest.summary}</p>{latest.reason?<code>{latest.reason}</code>:null}<p>{t('runtime')}</p><ul>{latest.plugins.map((p,i)=><li key={p.name+':'+i}>{p.name} {p.version} — {t(p.verdict)}<br/>{p.reasons.map(reason=>t(reason)).join('；')}</li>)}</ul></details>
   <button disabled={busy||!state?.enabled||latest.phase==='running'||rediscoveryRequired||error} onClick={()=>void mutate()}>{t('retry')}</button></>:<p>{t('none')}</p>}
  {usage?<><h3>{t('usage')}</h3><dl><dt>{t('input')}</dt><dd>{usage.reportedRequests?usage.promptTokens:t('unreported')}</dd><dt>{t('output')}</dt><dd>{usage.reportedRequests?usage.completionTokens:t('unreported')}</dd><dt>{t('estimate')}</dt><dd>{usage.reportedRequests?usage.estimatedCny.toFixed(6):t('unreported')}</dd><dt>{t('reserved')}</dt><dd>{usage.reservedCny.toFixed(6)}</dd></dl></>:null}
  {state?.available&&!usage?<p role="status">{t('accountingUnavailable')}</p>:null}<p>{t('notInvoice')}</p><p>{t('notInstallable')}</p>
 </section>;
}
