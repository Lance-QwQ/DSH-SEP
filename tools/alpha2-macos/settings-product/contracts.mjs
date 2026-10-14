import {classifyDiagnostic} from '../desktop/workspace-diagnostic.mjs';
export function classifySettingsRound(receipt,exit){
 const base=classifyDiagnostic(receipt,exit),settings=receipt?.settings;
 if(base.status!=='pass')return base;
 const verified=settings?.status==='pass'&&settings.recallFalse===true&&settings.defaultLimitCny===80&&settings.dialogClosed===true&&typeof settings.persistedFromPriorColdStart==='boolean';
 return {...base,status:verified?'pass':'fail'};
}
