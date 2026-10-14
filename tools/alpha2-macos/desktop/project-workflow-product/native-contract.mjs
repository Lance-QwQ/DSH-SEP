// Test receipt classification. A passing covered scope never upgrades unrun UI.
import {classifyDiagnostic} from '../workspace-diagnostic.mjs';
export const fixtureResourcesUnknown=e=>e?.resourcesUnknown===true||['SEP_PROJECT_CLEANUP_UNCONFIRMED','SEP_PROJECT_CLEANUP_BLOCKED','SEP_PROJECT_NATIVE_FIXTURE_BLOCKED'].includes(e?.code);
export function classifyProjectRound(receipt,exit){
 const base=classifyDiagnostic(receipt,exit),p=receipt?.project,dialog=p?.dialog;
 const nativeConfirmation=dialog?.status==='pass'&&dialog.actualDialog===true&&dialog.selectionObserved===true&&dialog.resultBound===true?'pass':'not_run';
 const common=p?.status==='pass'&&p.preloadBound===true&&p.panelMounted===true&&p.sourceUnchanged===true&&p.profileUnchanged===true&&![...(receipt?.events??[])].some(e=>e.type==='blocked');
 const actions=p?.round===1?p.emptyBaseline===true:p?.round===2&&p.reviewPresented===true&&p.cancelPreserved===true&&p.discardConfirmed===true&&p.restoreCandidate===true;
 const dialogHonest=dialog?.status==='not_run'||nativeConfirmation==='pass';
 return {...base,status:base.status==='pass'&&(!common||!actions||!dialogHonest)?'fail':base.status,nativeConfirmation};
}
