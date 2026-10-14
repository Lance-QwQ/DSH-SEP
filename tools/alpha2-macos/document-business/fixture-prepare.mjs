import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function prepareParser({base}){
 if(process.env.SEP_DOCUMENT_REAL_PARSER==='1'){
  const fixture=JSON.parse(await readFile(process.env.SEP_PARSER_ASSEMBLY_FIXTURE,'utf8'));
  return {parser:{runtimeRoot:fixture.runtimeRoot,manifestSha256:fixture.manifestSha256,stateRoot:join(base,'parser')}};
 }
 const runtimeRoot=join(base,'parser-runtime');await mkdir(runtimeRoot,{recursive:true,mode:0o700});return {parser:{runtimeRoot,manifestSha256:'1'.repeat(64),stateRoot:join(base,'parser')}};
}
