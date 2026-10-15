// Test-operator evidence classification. Never an application authority.
export function analyzeCases(rows) {
 const names=['cli','runloop','shared','shared-runloop'];
 const invalid=()=>{throw Error('HIDE_EXPERIMENT_INVALID');};
 if(!Array.isArray(rows)||rows.length!==4)invalid();
 const pids=new Set(),paths=new Set();
 const cases=rows.map((r,i)=>{
  if(r.variant!==names[i]||r.hideCalls!==1||!Number.isSafeInteger(r.pid)||r.pid<2||pids.has(r.pid)||typeof r.bundlePath!=='string'||paths.has(r.bundlePath)||!Number.isSafeInteger(r.birthSeconds)||r.birthSeconds<1||!Number.isSafeInteger(r.birthMicroseconds)||r.birthMicroseconds<0||r.birthMicroseconds>=1e6)invalid();
  pids.add(r.pid);paths.add(r.bundlePath);
  const admitted=r.ready?.visible===true&&r.ready.hidden===false&&r.ready.finishedLaunching===true&&r.ready.activationPolicy===0;
  const cleaned=r.cleanup?.exitCode===0&&r.cleanup.signal===null&&r.cleanup.forced===false&&r.cleanup.terminated===true;
  const independent=r.after?.sameIdentity===true;
  const observed=r.after?.hidden===true&&r.fixture?.hidden===true&&r.fixture?.didHide===true;
  const accepted=r.action?.exitCode===0&&r.action.status==='pass'&&r.action.requestSent===true;
  return {variant:r.variant,admitted,identityConfirmed:independent,cleanupConfirmed:cleaned,hideStatus:admitted&&independent&&accepted&&observed?'pass':'fail'};
 });
 const status=cases.every(c=>c.admitted&&c.identityConfirmed&&c.cleanupConfirmed)?'pass':'blocked';
 const pattern=status!=='pass'?'incomplete':cases[0].hideStatus==='pass'?'baseline-works':cases.every(c=>c.hideStatus==='fail')?'all-hide-failed':'baseline-fails-variants-differ';
 return {schema:1,status,scope:'completion of four independent AppKit fixture observations',cases,pattern,productRootCause:'not_run',productRetested:false};
}
