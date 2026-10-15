// Independent consumers share the root owner, but one failed stop must not
// skip all other cleanup. Successful releases are remembered; failures retry.
export function createConsumerCleanup({getEvaluation,getEvaluationFiber,fibers,getLayers}){
 let closing,complete=false,layersClosed=false;const disposed=new Set();
 return function close(){
  if(complete)return Promise.resolve();if(closing)return closing;
  closing=(async()=>{
   const errors=[];let evaluationReleased=true;const evaluation=getEvaluation();
   if(evaluation)try{const r=await evaluation.stop();if(r.status!=='pass'&&!(r.status==='not_run'&&r.scope==='entry_not_started'))throw Object.assign(Error('SEP_EVALUATION_CLEANUP_BLOCKED'),{code:'SEP_EVALUATION_CLEANUP_BLOCKED'});}catch(error){evaluationReleased=false;errors.push(Object.assign(Error('SEP_EVALUATION_CLEANUP_BLOCKED'),{code:'SEP_EVALUATION_CLEANUP_BLOCKED',cause:error}));}
   for(const fiber of [...fibers].reverse()){
    if(disposed.has(fiber)||!evaluationReleased&&fiber===getEvaluationFiber())continue;
    try{await fiber.dispose();disposed.add(fiber);}catch(error){errors.push(error);}
   }
   if(!layersClosed)try{await getLayers()?.close();layersClosed=true;}catch(error){errors.push(error);}
   if(errors.length)throw Object.assign(Error(errors[0].code??'SEP_CONSUMER_CLEANUP_BLOCKED'),{code:errors[0].code??'SEP_CONSUMER_CLEANUP_BLOCKED',causes:errors});
   complete=true;
  })().finally(()=>{closing=undefined;});return closing;
 };
}
