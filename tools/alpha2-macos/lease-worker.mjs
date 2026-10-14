// Native synthetic worker. Never executes user code or reaches a model API.
import {acquireOwnerFile} from './captured/owner-lease.mjs';
import {realpath} from 'node:fs/promises';
import {dirname} from 'node:path';
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('SEP_MACOS_NATIVE_REQUIRED');
const path=process.argv[2];if(!path||await realpath(dirname(path))!==dirname(path))throw Error('SEP_MACOS_TEST_PATH');
const lease=await acquireOwnerFile({path,payload:{pid:process.pid,purpose:'mac-native-test'},validatePrior:p=>p.purpose==='mac-native-test'});
process.stdout.write(JSON.stringify({ready:true,pid:process.pid})+'\n');
process.stdin.resume();process.stdin.once('end',()=>lease.release().then(()=>process.exit(0),()=>process.exit(1)));
