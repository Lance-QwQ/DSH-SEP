import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const exec=promisify(execFile);
// Test-only diagnostics. Commands consume exclusively synthetic input.
export async function loggedCommand(root,stage,exe,args){
  if(!/^[a-z][a-z0-9-]{0,50}$/.test(stage))throw Error('INVALID_TEST_STAGE');
  let result,error;
  try{result=await exec(exe,args,{timeout:30000,maxBuffer:1024*1024});}
  catch(e){result=e;error=e;}
  const text=value=>String(value??'').slice(0,65536);
  await writeFile(join(root,stage+'.log'),'stdout:\n'+text(result.stdout)+'\nstderr:\n'+text(result.stderr),{flag:'wx'});
  if(error){error.testStage=stage;throw error;}
  return {stdout:result.stdout,stderr:result.stderr};
}
