// Operator only. Generates test code, never installed product files.
import{readFile,writeFile}from'node:fs/promises';import{deriveDiagnostic}from'./derive.mjs';
const source={worker:await readFile(new URL('../desktop/workspace-diagnostic-worker.mjs',import.meta.url),'utf8'),operator:await readFile(new URL('../desktop/workspace-diagnostic.mjs',import.meta.url),'utf8')};
const result=deriveDiagnostic(source);for(const name of ['worker','operator'])await writeFile(new URL('./'+name+'.mjs',import.meta.url),result.outputs[name]);
await writeFile(new URL('./ORIGIN.json',import.meta.url),JSON.stringify({schema:1,productModified:false,...result.origin},null,2)+'\n');console.log(JSON.stringify({status:'pass',workerSha256:result.origin.worker.resultSha256,operatorSha256:result.origin.operator.resultSha256}));
