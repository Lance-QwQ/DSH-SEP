// Retain classification, never arbitrary messages, stacks, paths or bodies.
const classified=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value)?value:undefined;
export function failureDiagnostic(error){
 const code=classified(error?.code)??classified(error?.cause?.code)??'UNCLASSIFIED_FAILURE',causeCode=classified(error?.cause?.code);
 return {code,errorType:['Error','TypeError','RangeError','AbortError','ZodError'].includes(error?.name)?error.name:'Error',...causeCode&&causeCode!==code?{causeCode}:{}};
}
