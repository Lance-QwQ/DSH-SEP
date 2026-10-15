/** Exact public-program publication and shared Profile/file writer locks. No storage,
 * environment-file loading, model calls, or unreviewed alias cleanup. */
import {readFile,open,rename,unlink,lstat,stat,realpath,readdir,readlink,mkdir,symlink} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const demand=(value,code)=>{if(!value)fail(code);};
const key=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
const exists=async path=>{try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function directory(path){
  const st=await lstat(path,{bigint:true}),canonical=await realpath(path);
  demand(st.isDirectory()&&!st.isSymbolicLink()&&st.ino!==0n&&key(canonical)===key(path),'NP_DIRECTORY_CHANGED');
  return {path,canonical,device:String(st.dev),inode:String(st.ino)};
}
async function file(path,{source=false}={}){
  const canonical=await realpath(path),st=await lstat(path);demand(st.isFile()&&!st.isSymbolicLink()&&(source||st.nlink===1),'NP_FILE_INVALID');
  return {path,canonical,sha256:sha(await readFile(path)),...(process.platform==='win32'?{}:{mode:st.mode&0o7777})};
}
async function checkedFile(binding){
  let current;try{current=await file(binding.path,{source:true});}catch{fail('NP_SOURCE_CHANGED');}
  demand(isDeepStrictEqual(current,binding),'NP_SOURCE_CHANGED');
}
function stateValid(state){
  demand(state&&isDeepStrictEqual(Object.keys(state).sort(),['operationId','phase','profile','schemaVersion'])&&state.schemaVersion===1&&state.profile==='web'&&['installing','reconciled'].includes(state.phase)&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(state.operationId),'NP_STATE_INVALID');
}
async function readState(path){await file(path);return JSON.parse(await readFile(path,'utf8'));}
export async function createNativeProgramAdapter(options){
  const {homeRoot,profileRoot,oldHostRoot,candidateHostRoot,publicFiles,beforeAliases,candidateAliases,acquireOwnerFile}=options??{};
  for(const path of [homeRoot,profileRoot,oldHostRoot,candidateHostRoot])demand(isAbsolute(path??''),'NP_PATH_INVALID');
  demand(key(profileRoot)!==key(homeRoot)&&isAbsolute(options.transactionDirectory??''),'NP_PROFILE_SCOPE');
  demand(Array.isArray(publicFiles)&&publicFiles.length>0,'NP_PUBLIC_INVALID');
  const roots=await Promise.all([homeRoot,profileRoot].map(directory));

  const outputPaths=new Set(),sourcePaths=new Set();
  const files=[];
  for(const input of publicFiles){
    demand(input&&isDeepStrictEqual(Object.keys(input).sort(),(process.platform==='win32'?['candidateSource','oldSource','path']:['candidateMode','candidateSource','oldMode','oldSource','path']))&&[input.path,input.oldSource,input.candidateSource].every(isAbsolute),'NP_PUBLIC_INVALID');
    demand(!outputPaths.has(key(input.path)),'NP_PUBLIC_INVALID');outputPaths.add(key(input.path));
    sourcePaths.add(key(input.oldSource));sourcePaths.add(key(input.candidateSource));
    if(process.platform!=='win32'){demand([input.oldMode,input.candidateMode].every(m=>[0o600,0o644,0o700,0o755].includes(m)),'NP_PUBLIC_MODE');demand((await file(input.oldSource,{source:true})).mode===input.oldMode&&(await file(input.candidateSource,{source:true})).mode===input.candidateMode,'NP_SOURCE_CHANGED');}
    files.push({...input,parent:await directory(dirname(input.path)),old:await file(input.oldSource,{source:true}),candidate:await file(input.candidateSource,{source:true})});
  }
  demand([...sourcePaths].every(path=>!outputPaths.has(path)),'NP_PUBLIC_INVALID');
  const targetBindings=new Map(),targetCanonicals=new Map();
  async function reviewedAliases(values){
    demand(Array.isArray(values),'NP_ALIAS_INVALID');const names=new Set(),out=[];
    for(const item of values){
      demand(item&&isDeepStrictEqual(Object.keys(item).sort(),['name','target'])&&/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(item.name)&&!names.has(item.name)&&isAbsolute(item.target??''),'NP_ALIAS_INVALID');names.add(item.name);
      const canonical=await realpath(item.target);await directory(canonical);
      targetCanonicals.set(key(item.target),key(canonical));
      if(!targetBindings.has(canonical))targetBindings.set(canonical,{directory:await directory(canonical),manifest:await file(join(canonical,'package.json'),{source:true})});
      out.push({name:item.name,target:resolve(item.target)});
    }
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  }
  const expected={old:await reviewedAliases(beforeAliases),candidate:await reviewedAliases(candidateAliases)};
  const allowed=new Map();for(const entry of [...expected.old,...expected.candidate]){const set=allowed.get(entry.name)??new Set();set.add(key(entry.target));allowed.set(entry.name,set);}
  const modulesRoot=join(homeRoot,'profiles/node_modules');
  const scopes=new Set([...allowed.keys()].filter(name=>name.startsWith('@')).map(name=>name.split('/')[0]));
  let releaseNative=null, heldLeases=[];
  function requireLease(){demand(releaseNative!==null,'NP_LEASE_REQUIRED');}
  async function verifyRoots(){for(const root of roots)demand(isDeepStrictEqual(await directory(root.path),root),'NP_DIRECTORY_CHANGED');}
  async function verifySources(){
    await verifyRoots();
    for(const lease of heldLeases)await lease.assertOwned();
    for(const item of files){demand(isDeepStrictEqual(await directory(dirname(item.path)),item.parent),'NP_DIRECTORY_CHANGED');await checkedFile(item.old);await checkedFile(item.candidate);}
    for(const target of targetBindings.values()){demand(isDeepStrictEqual(await directory(target.directory.path),target.directory),'NP_SOURCE_CHANGED');await checkedFile(target.manifest);}
  }
  async function readAlias(name){
    const path=join(modulesRoot,name),st=await lstat(path);demand(st.isSymbolicLink()&&allowed.has(name),'NP_ALIAS_UNREVIEWED');
    const target=resolve(dirname(path),await readlink(path));demand(allowed.get(name).has(key(target)),'NP_ALIAS_UNREVIEWED');
    demand(key(await realpath(path))===targetCanonicals.get(key(target)),'NP_ALIAS_UNREVIEWED');return {name,target};
  }
  async function listAliases(){
    if(!await exists(modulesRoot))return [];
    try{await directory(modulesRoot);}catch{fail('NP_ALIAS_UNREVIEWED');}
    const result=[];
    for(const item of await readdir(modulesRoot,{withFileTypes:true})){
      let names;
      if(item.name.startsWith('@')){
        demand(scopes.has(item.name),'NP_ALIAS_UNREVIEWED');try{await directory(join(modulesRoot,item.name));}catch{fail('NP_ALIAS_UNREVIEWED');}
        names=(await readdir(join(modulesRoot,item.name))).map(name=>item.name+'/'+name);
      }else names=[item.name];
      for(const name of names)result.push(await readAlias(name));
    }
    return result.sort((a,b)=>a.name.localeCompare(b.name));
  }
  async function publicState(item){
    if(!await exists(item.path))return null;
    let bound;try{bound=await file(item.path);}catch{fail('NP_PUBLIC_UNREVIEWED');}
    demand([item.old,item.candidate].some(b=>b.sha256===bound.sha256&&(process.platform==='win32'||b.mode===bound.mode)),'NP_PUBLIC_UNREVIEWED');return bound.sha256;
  }
  async function preflight(){await verifySources();const links=await listAliases();for(const item of files)await publicState(item);return links;}
  async function verifyProgram({direction}={}){
    demand(direction==='old'||direction==='candidate','NP_DIRECTION_INVALID');await preflight();
    for(const item of files){demand(await publicState(item)===item[direction].sha256,'NP_PUBLIC_CHANGED');if(process.platform!=='win32')demand((await file(item.path)).mode===item[direction].mode,'NP_PUBLIC_CHANGED');}
    demand(isDeepStrictEqual(await listAliases(),expected[direction]),'NP_ALIAS_CHANGED');return {status:'pass',direction,aliases:expected[direction].length};
  }
  async function replace(item,direction){
    await publicState(item);await checkedFile(item[direction]);const bytes=await readFile(item[direction].path);demand(sha(bytes)===item[direction].sha256,'NP_SOURCE_CHANGED');
    const temporary=item.path+'.'+randomUUID()+'.tmp',handle=await open(temporary,'wx',0o600);
    try{await handle.writeFile(bytes);if(process.platform!=='win32')await handle.chmod(item[direction].mode);await handle.sync();}finally{await handle.close();}
    await publicState(item);await rename(temporary,item.path);
    if(process.platform!=='win32'){const dir=await open(dirname(item.path),'r');try{await dir.sync();}finally{await dir.close();}}
  }
  async function publishProgram({direction}={}){
    requireLease();demand(direction==='old'||direction==='candidate','NP_DIRECTION_INVALID');await preflight();
    for(const item of files)await replace(item,direction);
    const current=await listAliases(),desired=new Map(expected[direction].map(item=>[item.name,item]));
    await mkdir(modulesRoot,{recursive:true});await directory(modulesRoot);
    for(const item of current){if(desired.get(item.name)?.target===item.target)continue;demand(isDeepStrictEqual(await readAlias(item.name),item),'NP_ALIAS_UNREVIEWED');await unlink(join(modulesRoot,item.name));}
    for(const item of expected[direction]){
      const path=join(modulesRoot,item.name);if(await exists(path))continue;
      await mkdir(dirname(path),{recursive:true});await directory(dirname(path));await symlink(item.target,path,process.platform==='win32'?'junction':'dir');
    }
    await verifyProgram({direction});return {status:'pass',direction,aliases:expected[direction].length};
  }
  // These are SEP publication records, not obsolete native installation state.
  const statePaths=[join(homeRoot,'.sep-publication-state.json'),join(options.transactionDirectory,'native-profile-state.json')];
  const lockTargets=[...new Set([join(profileRoot,'package.json'),...(options.additionalProfileRoots??[]).map(p=>join(p,'package.json')),...publicFiles.map(f=>f.path)].map(p=>resolve(p)))].sort();
  for(const target of lockTargets)await directory(dirname(target));
  async function writeState(path,state){
    const temporary=path+'.'+randomUUID()+'.tmp',f=await open(temporary,'wx',0o600);
    try{await f.writeFile(JSON.stringify(state)+'\n');await f.sync();}finally{await f.close();}
    await rename(temporary,path);
  }
  return {
    native:{statePaths,
      async assertOwned(){requireLease();await verifySources();},
      async acquire(){
        demand(releaseNative===null,'NP_LEASE_ALREADY_HELD');await verifyRoots();
        const leases=[];
        try{
          for(const target of lockTargets){
            const payload={schema:1,kind:'sep-profile-publication-lock',pid:process.pid,target,transactionDirectory:resolve(options.transactionDirectory)};
            const lease=await acquireOwnerFile({path:target+'.lock',payload,validatePrior:p=>{
              demand(p?.schema===1&&p.kind===payload.kind&&p.target===target&&p.transactionDirectory===payload.transactionDirectory&&Number.isInteger(p.pid)&&p.pid>0,'NP_LOCK_OWNER_UNVERIFIED');return p;
            }});leases.push(lease);
          }
        }catch(error){const failures=[error];for(const lease of [...leases].reverse())try{await lease.release();}catch(e){failures.push(e);}if(failures.length>1)throw new AggregateError(failures,'NP_ACQUIRE_CLEANUP_FAILED');throw error;}
        heldLeases=leases;let released=false;
        releaseNative=async()=>{if(released)return;released=true;const failures=[];try{for(const lease of [...leases].reverse())try{await lease.release();}catch(e){failures.push(e);}}finally{heldLeases=[];releaseNative=null;}if(failures.length)throw new AggregateError(failures,'NP_RELEASE_FAILED');};
        return releaseNative;
      },
      async record(state){requireLease();stateValid(state);await verifySources();for(const path of statePaths)await writeState(path,state);},
      async verify({state}={}){
        await verifyRoots();for(const lease of heldLeases)await lease.assertOwned();
        const actual=await Promise.all(statePaths.map(readState));for(const value of actual)stateValid(value);
        demand(isDeepStrictEqual(actual[0],actual[1]),'NP_STATE_CHANGED');
        if(state){stateValid(state);demand(actual.every(value=>isDeepStrictEqual(value,state)),'NP_STATE_CHANGED');}
        else demand(actual.every(value=>value.phase==='reconciled'),'NP_STATE_CHANGED');
        return {status:'pass',statePaths,scope:'SEP records plus native-compatible Profile/file writer locks'};
      },
    },
    program:{publish:publishProgram,verify:verifyProgram},
  };
}
