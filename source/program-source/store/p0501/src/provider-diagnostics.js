// Use only bounded protocol metadata; never copy provider bodies or exception messages.
const categories=Object.freeze({400:'BAD_REQUEST',401:'AUTHENTICATION',402:'PAYMENT_REQUIRED',403:'FORBIDDEN',404:'NOT_FOUND',422:'INVALID_PARAMETERS',429:'RATE_LIMIT',500:'SERVER_ERROR',502:'BAD_GATEWAY',503:'SERVICE_UNAVAILABLE',504:'GATEWAY_TIMEOUT'});
export function memoryFailureCode(error){
  const status=error.httpStatus;
  if(error.code==='PROVIDER_HTTP'&&Number.isInteger(status)&&status>=300&&status<=599){
    return 'PROVIDER_HTTP_'+status+(Object.hasOwn(categories,status)?'_'+categories[status]:'');
  }
  return error.code??'MEMORY_EXTRACTION_FAILED';
}
