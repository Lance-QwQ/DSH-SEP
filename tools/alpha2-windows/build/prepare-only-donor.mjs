import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {stableBytes,copyVerifiedProgram} from './program-files.mjs';
const [outputArg,hostArg]=process.argv.slice(2),output=resolve(outputArg),host=resolve(hostArg);
if(!/^D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1$/i.test(output)||resolve(await realpath(host)).toLowerCase()!==host.toLowerCase())throw Error('SCOPE');
const program=join(output,'program'),graph=JSON.parse(await readFile(join(program,'graph.json'))),sha=b=>createHash('sha256').update(b).digest('hex'),required=[],packages=new Map();
// Propose files for independent registry-tar validation. This pass does not
// certify official provenance. SEP and third-party packages are never donors.
for(const row of graph.files){
 const match=/^node_modules\/(@deepseek-ai\/[^/]+)\/(.+)$/.exec(row.path);if(!match||match[2].startsWith('node_modules/'))continue;
 const name=match[1],base='node_modules/'+name;
 let metadata=packages.get(name);
 if(metadata===undefined){try{const a=await readFile(join(program,base,'package.json')),b=await readFile(join(host,base,'package.json')),ma=JSON.parse(a),mb=JSON.parse(b);metadata=ma.name===name&&mb.name===name&&ma.version===mb.version&&sha(a)===sha(b)?{name,version:ma.version,manifestHash:sha(b)}:null;}catch(error){if(error.code!=='ENOENT')throw error;metadata=null;}packages.set(name,metadata);}
 if(!metadata)continue;
 required.push({...row,sourcePath:row.path,packageName:name,version:metadata.version,manifestHash:metadata.manifestHash});
}
if(required.length<500)throw Error('OFFICIAL_DONOR_COVERAGE_UNEXPECTED');
const used=[...new Set(required.map(x=>x.packageName))].sort().map(x=>packages.get(x));
await writeFile(join(output,'ONLY-REQUIRED-CANDIDATE.json'),JSON.stringify({schema:1,status:'not_run',source:'candidate subset only; must be intersected with independently SRI-verified official tar members before use',required,packages:used},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'candidate-prepared',candidateFiles:required.length,candidatePackages:used.length,candidateBytes:required.reduce((n,x)=>n+x.size,0)}));
