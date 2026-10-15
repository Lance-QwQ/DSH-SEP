// Local private handoff proof. Opens only read handles, never an Agent/writer.
import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const host=process.env.SEP_DAILY_MANAGED_HOST,require=createRequire(join(host,'package.json'));
const load=name=>import(pathToFileURL(require.resolve(name))),bundle=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const root='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/private-capture-r4/sessions';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function witness(){const rows={};async function visit(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('SESSION_PATH_ALIAS');if(entry.isDirectory())await visit(path);else{const s=await lstat(path);if(!s.isFile()||s.nlink!==1)throw Error('SESSION_PATH_ALIAS');rows[path]=sha(await readFile(path));}}}await visit(root);return rows;}
const before=await witness(),{Context}=await load('@deepseek-ai/cordis'),{SessionStore,SessionId}=await load('@deepseek-ai/dsh-session');
const {default:Provider}=await import(pathToFileURL(join(bundle,'bundle/lib/session-persistence.js'))),{sessionEvents}=await import(pathToFileURL(join(bundle,'bundle/modules/system-enhancement-package/src/session-events.js')));
const ctx=new Context(),report={scope:'Actual private catalog + read-only SEP provider + official SessionStore.prepare; no writer, Agent, model, body export or migration',status:'blocked',listed:0,rehydrated:0,events:0,inMemoryNativeSeedClosers:0,sourceFiles:Object.keys(before).length,failures:[]};
try{
 await ctx.plugin(SessionStore);await ctx.plugin(Provider,{root,compression:'none',requireExistingRoot:true});
 const catalog=await ctx.sessionPersistence.list();report.listed=catalog.length;
 for(const [index,row] of catalog.entries()){let handle;try{
  handle=await ctx.sessionPersistence.open(SessionId(row.header.id),'read');const result=await handle.read();
  const session=ctx.sessions.prepare(SessionId(row.header.id),{seed:result.events,meta:structuredClone(handle.header),inheritedEventCount:handle.inheritedEventCount,eventState:result.eventState});
  const restored=sessionEvents(session),tail=restored.slice(result.events.length);
  if(session.id!==row.header.id||session.header.cwd!==handle.header.cwd||session.header.createdAt!==handle.header.createdAt||!isDeepStrictEqual(restored.slice(0,result.events.length),result.events)||tail.length>1||tail.some(event=>event.type!=='session/end-seed'))throw Error('SESSION_REHYDRATE_CHANGED');
  report.inMemoryNativeSeedClosers+=tail.length;
  report.rehydrated++;report.events+=result.events.length;
 }catch(error){report.failures.push({catalogIndex:index,code:/^[A-Z][A-Z0-9_]+$/.test(error.code??error.message)?error.code??error.message:'SESSION_READ_REFUSED',errorType:error.name});}finally{await handle?.close();}}
 report.status=report.failures.length?'blocked':'pass';
}finally{await ctx.fiber.dispose();}
const after=await witness();report.sourceBytesUnchanged=JSON.stringify(before)===JSON.stringify(after);report.sourceWitnessSha256=sha(JSON.stringify(before));
const generation=process.argv[2]??'r1';if(!/^r[1-9][0-9]*$/.test(generation))throw Error('GENERATION');
await writeFile(join(process.env.SEP_BUNDLE_TEST_ROOT,'PRIVATE-SESSION-REHYDRATE-'+generation+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));if(report.status!=='pass'||!report.sourceBytesUnchanged)process.exitCode=1;
