// Actual Darwin build. This assembles a desktop carrier, not a complete SEP Profile.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {carrierPaths,deriveCarrier} from './carrier-origin.mjs';
const [sourceArg,outArg]=process.argv.slice(2),commit='d743267388641bc76f17c45ce8b4c231aed1d32c';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
assert(sourceArg&&outArg&&process.env.RUNNER_TEMP);
const source=await realpath(sourceArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);
assert(source.startsWith(temp+'/')&&out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));
await mkdir(out,{mode:0o700});process.umask(0o077);
const commands=[],changes=[];let current;
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(TOKEN|SECRET|PASSWORD|API_KEY|^APPLE_|^CSC_)/i.test(k)));
cleanEnv.DSH_TELEMETRY_DISABLED='1';cleanEnv.CI='true';cleanEnv.LEFTHOOK='0';
cleanEnv.npm_config_store_dir=join(out,'pnpm-store');cleanEnv.npm_config_cache=join(out,'npm-cache');
async function run(name,file,args,cwd=source,limit=120000){
 const log=createWriteStream(join(out,name+'.log'),{flags:'wx'}),started=Date.now();
 const child=spawn(file,args,{cwd,env:cleanEnv,stdio:['ignore','pipe','pipe'],detached:true});current=child;
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});let tail='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{tail=(tail+b).slice(-2048);});
 let expired=false;const timer=setTimeout(()=>{expired=true;try{process.kill(-child.pid,'SIGKILL');}catch{}},limit);
 try{const code=await new Promise((res,rej)=>{child.once('error',rej);child.once('close',res);});
  commands.push({name,exitCode:code,timedOut:expired,durationMs:Date.now()-started});
  if(code!==0||expired){console.error(tail);throw Error('SEP_MAC_BUILD_'+name.toUpperCase().replace(/[^A-Z0-9_]/g,'_'));}
 }finally{clearTimeout(timer);log.end();current=undefined;}
}
const result={schema:1,status:'fail',scope:'Alpha.2 independent macOS arm64 desktop carrier; SEP controlled Profile not yet installed',officialCommit:commit,commands,changes,fullSepCertification:'not_run',publicRelease:false};
try{
 await run('commit','git',['rev-parse','HEAD']);assert.equal((await readFile(join(out,'commit.log'),'utf8')).trim(),commit);
 const expected={'pnpm-lock.yaml':'b45f8695fb0dca90d3ed07afc766e923356539962706ee36ac8cdb396e6d734d','scripts/primary-runtime/lock.json':'733c3c53d95ae524bddb123e1319c48ecacb0dc729be956c25188f930c095bd5'};
 for(const [path,h]of Object.entries(expected))assert.equal(createHash('sha256').update(await readFile(join(source,path))).digest('hex'),h);
 await run('origin-tests',process.execPath,['--test',resolve(import.meta.dirname,'carrier-origin.test.mjs')],source,60000);
 for(const path of carrierPaths){const r=deriveCarrier(path,await readFile(join(source,path)));await writeFile(join(source,path),r.bytes);changes.push(r.origin);}
 await writeFile(join(out,'ORIGIN.json'),JSON.stringify(changes,null,2)+'\n');
 const response=await fetch('https://registry.npmjs.org/pnpm/-/pnpm-11.28.5.tgz',{signal:AbortSignal.timeout(60000)});assert(response.ok);
 const archive=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha512').update(archive).digest('base64'),'SEVj0wtMKtJ8tIqpT/KzAtvOvI/2vyiBbCWJiG4UbOf3bzVPO8GkOOb16XaMMCqgpvet2CMpA81M+BQmy8FNng==');
 await writeFile(join(out,'pnpm.tgz'),archive,{flag:'wx'});await mkdir(join(out,'pnpm'));
 await run('pnpm-extract','tar',['-xzf',join(out,'pnpm.tgz'),'-C',join(out,'pnpm')]);
 // pnpm's own package may use mjs; choose only its manifest-declared executable.
 const manifest=JSON.parse(await readFile(join(out,'pnpm/package/package.json'),'utf8'));
 assert.equal(manifest.version,'11.28.5');const entry=join(out,'pnpm/package',manifest.bin.pnpm);assert(entry.startsWith(join(out,'pnpm/package')+'/'));
 await run('install',process.execPath,[entry,'install','--frozen-lockfile','--config.minimumReleaseAge=1440','--config.store-dir='+join(out,'pnpm-store')],source,1200000);
 await run('package',process.execPath,[entry,'--dir','apps/desktop','run','package:mac:arm64:unsigned','--dir'],source,2700000);
 result.app=join(source,'apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/mac-arm64/DSH SEP.app');
 assert.equal(await realpath(result.app),result.app);
 await run('plist','/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',join(result.app,'Contents/Info.plist')]);
 assert.equal((await readFile(join(out,'plist.log'),'utf8')).trim(),'ai.dshsep.alpha2.preview');
 await run('export','ditto',['-c','-k','--sequesterRsrc','--keepParent',result.app,join(out,'desktop-carrier.zip')],source,300000);
 const artifact=join(out,'desktop-carrier.zip'),digest=createHash('sha256');for await(const bytes of createReadStream(artifact))digest.update(bytes);
 result.status='pass';result.artifact='desktop-carrier.zip';result.artifactSha256=digest.digest('hex');result.artifactBytes=(await stat(artifact)).size;result.note='Official package command includes prepared and packaged native runtime smoke; actual UI smoke is separate.';
}catch(e){result.code=/^[A-Z_]+$/.test(e.message)?e.message:'SEP_MAC_CARRIER_BUILD_FAILED';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'BUILD-RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,code:result.code,commands:commands.length}));}
