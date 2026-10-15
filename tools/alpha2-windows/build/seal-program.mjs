import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {stableBytes} from './program-files.mjs';
const [outputArg,repositoryArg,launcherArg]=process.argv.slice(2),output=resolve(outputArg),repository=resolve(repositoryArg),launcher=resolve(launcherArg);
if(!/^D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1$/i.test(output))throw Error('OUTPUT_SCOPE');
const root=join(output,'program'),sha=b=>createHash('sha256').update(b).digest('hex');
const proof=JSON.parse(await readFile(join(root,'PUBLIC-PRESET-VERIFICATION.json')));if(proof.status!=='pass')throw Error('PUBLIC_PRESETS_UNVERIFIED');
const{writeProgramGraph}=await import(pathToFileURL(join(repository,'tools/daily-adaptation/build/program-graph.mjs')));
let graph,graphHash;
try{const bytes=await readFile(join(root,'graph.json'));graph=JSON.parse(bytes);graphHash=sha(bytes);for(const row of graph.files)await stableBytes(join(root,row.path),row);}
catch(error){if(error.code!=='ENOENT')throw error;({graph,sha256:graphHash}=await writeProgramGraph(root));}
const old=JSON.parse(await readFile(join(output,'BASE-DESKTOP-RUNTIME.json'))),helper=await import(pathToFileURL(join(root,'build-runtime-helper.mjs')));
try{await readFile(join(root,'desktop-runtime.json'));}catch(error){if(error.code!=='ENOENT')throw error;helper.writeDesktopRuntime(root,old.release,old.sharedPackages.map(x=>x.name),{platform:'win32',arch:'x64'});}
await helper.verifyDesktopRuntime(root,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
const target=join(output,'support/managed/bootstrap');await mkdir(target,{recursive:true});
const originBytes=await readFile(join(launcher,'ORIGIN.json')),origin=JSON.parse(originBytes),entries=[];
async function writeExact(path,bytes){try{await writeFile(path,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||!(await readFile(path)).equals(Buffer.from(bytes)))throw error;}}
// This source was shipped beside, but omitted from, the historical ORIGIN.
// Bind it independently to the tracked Alpha.2 source and fixed content hash.
const extraFile='installed-sep-version.mjs',extraHash='dd51ec2cf3a8bf714726842915ed3490262a6548b86ab64db03eb3763b188dcc';
if(sha(await readFile(join(repository,'tools/alpha2-desktop/daily-adaptation/lib',extraFile)))!==extraHash)throw Error('BOOTSTRAP_EXTRA_SOURCE_CHANGED');
for(const row of [...origin.origins,{file:extraFile,resultSha256:extraHash}]){if(!/^[\w-]+\.mjs$/.test(row.file))throw Error('BOOTSTRAP_PATH');const before=await readFile(join(launcher,row.file));if(sha(before)!==row.resultSha256)throw Error('BOOTSTRAP_ORIGIN_CHANGED');let after=before,change='none';if(row.file==='launcher.mjs'){const text=before.toString(),oldHash='715ed1c0495d91bba2131029ec0475b2e735d1688b156ce269df149487427a2b';if(text.split(oldHash).length!==2)throw Error('BOOTSTRAP_GRAPH_ANCHOR');after=Buffer.from(text.replace(oldHash,graphHash));change='bind sanitized program graph';}await writeExact(join(target,row.file),after);entries.push({file:row.file,inputSha256:sha(before),outputSha256:sha(after),change,...row.file===extraFile?{separateSource:'tools/alpha2-desktop/daily-adaptation/lib/installed-sep-version.mjs'}:{}});}
if((await readdir(launcher)).length!==entries.length+1)throw Error('BOOTSTRAP_UNBOUND_FILE');
await writeFile(join(target,'ORIGIN.json'),JSON.stringify({schema:1,kind:'windows-package-bootstrap',originalOriginSha256:sha(originBytes),target:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1',graphHash,files:entries},null,2)+'\n',{flag:'wx'});
const descriptorBytes=await readFile(join(root,'desktop-runtime.json'));
const result={schema:1,status:'pass',graph:{path:'graph.json',size:(await readFile(join(root,'graph.json'))).length,sha256:graphHash,mode:420},descriptor:{path:'desktop-runtime.json',size:descriptorBytes.length,sha256:sha(descriptorBytes),mode:420},programFiles:graph.files.length,packages:graph.packages.length,bootstrapFiles:entries.length+1};
await writeFile(join(output,'PROGRAM-SEALED.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
