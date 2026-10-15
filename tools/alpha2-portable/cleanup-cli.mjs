// Local trusted controller only. Review never signals processes. An approval
// authorizes deletion only after a second identity/namespace-empty check.
import {openManagedProject} from './managed-project.mjs';
import {readFile} from 'node:fs/promises';
const [action,configPath,planHash,...extra]=process.argv.slice(2);
if(extra.length||!['review','resolve'].includes(action)||!configPath||action==='review'&&planHash||action==='resolve'&&!/^[a-f0-9]{64}$/.test(planHash??''))throw Error('SEP_CLEANUP_CLI_INPUT');
const config=JSON.parse(await readFile(configPath,'utf8'));
if(Object.keys(config).sort().join(',')!=='isolation,root')throw Error('SEP_CLEANUP_CLI_INPUT');
const project=await openManagedProject(config);
try{console.log(JSON.stringify(action==='review'?await project.reviewCleanup():await project.resolveCleanup({planHash})));}finally{await project.close();}
