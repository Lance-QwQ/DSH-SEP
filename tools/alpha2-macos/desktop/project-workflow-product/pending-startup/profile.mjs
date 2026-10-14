import {frozen,transform,evaluate} from '../../../document-business/derive.mjs';
const file=new URL('../../../profile/controlled-files.mjs',import.meta.url);
const source=await frozen(file,'400a6c84f94dc87efc40406dced9d38e71b22e3c4a285327d9e71f54c435a9ca');
const derived=transform(source,[{before:'  current:()=>serial(()=>project.current()),plans:()=>serial(()=>project.plans()),',after:`  current:()=>serial(()=>project.current()),plans:()=>serial(()=>project.plans()),
  startupIdentity:()=>serial(async()=>{
   const before=await project.current(),snapshot=await project.view(pendingPlan),plans=await project.plans(),after=await project.current();
   if(before.generation!==after.generation||before.sequence!==after.sequence)fail('SEP_PROJECT_BASELINE_CHANGED');
   return Object.freeze({generation:before.generation,sequence:before.sequence,version:snapshot.version,sha256:snapshot.sha256,needsSelection,selectedPlanHash:pendingPlan??null,pendingPlanHashes:plans.map(p=>p.planHash).sort()});
  }),`}]);
export const origin=derived.receipt;
export const {createControlledFileProfile}=await evaluate(derived.source,file);
