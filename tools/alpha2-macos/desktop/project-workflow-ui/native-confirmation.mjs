import {fail} from './rules.mjs';
// Supply Electron's main-process dialog module, never a renderer function.
export function createNativeConfirmation(dialog){
 if(typeof dialog?.showMessageBox!=='function')fail('SEP_PROJECT_UI_CONFIG');
 return async({window,review,signal})=>{
  if(!window||!signal||signal.aborted)fail('SEP_PROJECT_UI_CONFIRMATION');
  const omitted=review.coverage.omitted.length>0;
  const options={type:'question',title:'Commit reviewed changes',message:`Commit ${review.changes.length} reviewed change(s) to the current project?`,detail:`Project: ${review.binding.projectId}\nBase generation: ${review.binding.baseGeneration}\nPlan: ${review.binding.planHash}\nReview: ${review.reviewSha256}\n${omitted?'Some content is omitted from the text review.':'The review contains no omitted content.'}`,buttons:['Cancel','Commit changes'],defaultId:0,cancelId:0,noLink:true,signal};
  if(omitted){options.checkboxLabel='I acknowledge the content omitted from the review';options.checkboxChecked=false;}
  const result=await dialog.showMessageBox(window,options);
  if(signal.aborted)return {accepted:false,omissionsAcknowledged:false};
  const accepted=result.response===1;return {accepted,omissionsAcknowledged:accepted&&omitted&&result.checkboxChecked===true};
 };
}
