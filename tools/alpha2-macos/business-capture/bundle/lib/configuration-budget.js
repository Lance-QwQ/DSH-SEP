import { createHash } from 'node:crypto';
import { parseBudgetLedger, summarizeBudget } from '../modules/system-enhancement-package/src/budget-ledger.js';
import { normalizeBundleConfig } from './configuration.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};

/** Review supplied existing bytes; deliberately never constructs or initializes a Budget. */
export function reviewExistingBudget(bytes, input) {
  const configuration=normalizeBundleConfig(input);
  if(bytes===undefined || bytes===null) fail('SEP_BUNDLE_LEDGER_REQUIRED');
  if(typeof bytes!=='string' && !Buffer.isBuffer(bytes)) fail('SEP_BUNDLE_LEDGER_INVALID');
  const data=Buffer.from(bytes);
  if(data.length===0 || data.length>16*1024*1024) fail('SEP_BUNDLE_LEDGER_INVALID');
  let state,accounting;
  try {state=parseBudgetLedger(JSON.parse(data.toString('utf8')));accounting=summarizeBudget(state);}
  catch {fail('SEP_BUNDLE_LEDGER_INVALID');}
  const sessionDefault=state.version===3 ? Object.freeze({...state.sessionDefault}) : null;
  return Object.freeze({
    mode:'preserve-existing',businessEnabled:false,configurationApplied:false,
    ledgerSha256:createHash('sha256').update(data).digest('hex'),ledgerVersion:state.version,
    migrationRequired:state.version<3,
    requestedDefaults:configuration.budget,
    persistedPolicy:Object.freeze({sharedLimitCny:state.limit,sessionDefault,
      sessionOverrideCount:Object.keys(state.sessionLimits??{}).length,
      taskOverrideCount:Object.keys(state.taskLimits??{}).length}),
    accounting:Object.freeze(accounting),
    policyChangeRequested:configuration.budget.sharedLimitCny!==state.limit || !sessionDefault || configuration.budget.sessionDefaultLimitCny!==sessionDefault.limitCny,
  });
}
