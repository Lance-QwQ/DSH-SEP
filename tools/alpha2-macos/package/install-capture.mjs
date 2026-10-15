// Install only the fixed program capture into a native dependency closure.
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyCapture} from '../business/capture-runtime.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
export async function installCapture(source,destination,expectedSha256){
 if(!/^[a-f0-9]{64}$/.test(expectedSha256??''))fail('SEP_MAC_CAPTURE_BINDING');
 const bytes=await readFile(join(source,'CAPTURE.json'));if(sha(bytes)!==expectedSha256)fail('SEP_MAC_CAPTURE_BINDING');
 const manifest=await verifyCapture(source);await mkdir(destination,{mode:0o700});
 for(const row of manifest.inputs){const target=join(destination,row.path);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(join(source,row.path),target,1);}
 await copyFile(join(source,'CAPTURE.json'),join(destination,'CAPTURE.json'),1);
 if(sha(await readFile(join(destination,'CAPTURE.json')))!==expectedSha256)fail('SEP_MAC_CAPTURE_BINDING');
 await verifyCapture(destination);return {sha256:expectedSha256,files:manifest.inputs.length};
}
