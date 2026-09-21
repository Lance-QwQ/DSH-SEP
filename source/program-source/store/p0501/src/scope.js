import { isAbsolute, join, relative, sep, resolve } from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import { fail, checkAbort, digest } from './errors.js';
import {recoveryBinding,sameRecoveryRoot} from './recovery-binding.js';
const SECRET = /^(?:\.git|\.dsh|\.codex|node_modules|\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519)$/i;
// Exact names owned by this suite, including native JSON domain files. Ordinary
// memory/archive/kv folders and similarly named documentation remain valid sources.
const INTERNAL = /^(?:\.suite-memory|dsh_(?:four_layer_(?:memory|archive)|enhancement_suite)_v1\.json|dsh-system-enhancement-package-v1\.lock)$/i;
const excluded = name => SECRET.test(name) || INTERNAL.test(name);
const localKey = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);

// rc.5's normalized local stat omits nlink. Bind its actual local URL/path and
// version to an OS lstat before trusting a source; an alias is not a new grant.
async function localFileIdentity(fs,target,info,signal) {
  checkAbort(signal);
  let path,url;
  try {path=fs.processPath(target);url=new URL(fs.fileUrl(target));}
  catch {fail('UNAUTHORIZED','Source has no verified local filesystem identity');}
  if(typeof path!=='string'||!isAbsolute(path)||typeof target.targetKey!=='string'||path!==target.targetKey||url?.protocol!=='file:')fail('UNAUTHORIZED','Source has no verified local filesystem identity');
  let urlPath;try{urlPath=fileURLToPath(url);}catch{fail('UNAUTHORIZED','Source has no verified local filesystem identity');}
  if(localKey(urlPath)!==localKey(path))fail('UNAUTHORIZED','Source local path identities differ');
  let actual,canonical;
  try {actual=await lstat(path,{bigint:true});canonical=await realpath(path);}
  catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')fail('NOT_FOUND');fail('UNAUTHORIZED','Source local identity cannot be verified');}
  checkAbort(signal);
  if(!actual.isFile()||actual.isSymbolicLink()||actual.nlink!==1n||localKey(canonical)!==localKey(path))fail('UNAUTHORIZED','Linked files are not authorized sources');
  const version=`${actual.dev}:${actual.ino}:${actual.size}:${actual.mtimeNs}:${actual.ctimeNs}`;
  if(info?.type!=='file'||info.size!==Number(actual.size)||info.version!==version)fail('SOURCE_CHANGED');
  return version;
}

export class Scope {
  constructor(fs, projects, recovery={}) { this.fs = fs; this.config = projects; this.projects = [];this.recoveryOptions=recovery; }
  setDocumentGuard(guard){this.documentGuard=guard;}
  isDocumentExcluded(project,path,identity){
    const parts=path.replaceAll('\\','/').split('/');
    if(parts.includes('..'))fail('UNAUTHORIZED');
    const normalized=parts.filter(p=>p&&p!=='.').join('/');
    return normalized?this.documentGuard?.(project,normalized,identity)??false:false;
  }
  async init() {
    if(this.recoveryOptions.enabled)this.recovery=recoveryBinding(this.recoveryOptions.recoveryHost);
    for (const p of this.config) {
      if (!isAbsolute(p.root)) fail('CONFIG', 'Project roots must be absolute');
      const authority=this.recovery?await this.recovery.configured(p):null;
      if(authority?.state==='paused'){
        this.projects.push({...p,root:authority.root,target:null,key:authority.memoryKey,recoveryProjectId:authority.id,recoveryGeneration:authority.generation,recoveryState:'paused'});
        continue;
      }
      if(authority)await this.recovery.ready(authority);
      const target = await this.fs.resolve(authority?.root??p.root);
      if ((await this.fs.stat(target))?.type !== 'directory') fail('CONFIG', 'Project root must exist');
      const root = this.fs.processPath(target);
      if (root.split(/[\\/]/).some(piece => INTERNAL.test(piece))) fail('UNAUTHORIZED', 'Suite memory storage cannot be a source project');
      if (this.projects.some(old => old.target&&(this.fs.contains(old.target, target) || this.fs.contains(target, old.target)))) fail('CONFIG', 'Project roots must not overlap');
      const project = { ...p, root, target, key: authority?.memoryKey??digest(process.platform === 'win32' ? root.toLowerCase() : root),...(authority?{recoveryProjectId:authority.id,recoveryGeneration:authority.generation,recoveryState:'ready'}:{}) };
      this.projects.push(project);
      for (const source of p.sources) {
        const sourceTarget=await this.resolve(project,source),info=await this.fs.stat(sourceTarget);
        if(info?.type==='file')await localFileIdentity(this.fs,sourceTarget,info);
      }
    }
  }
  async caller(exec) {
    checkAbort(exec.signal);
    const cwd = exec.agent?.session?.header?.cwd;
    if (!cwd || !isAbsolute(cwd)) fail('UNAUTHORIZED', 'A trusted session cwd is required');
    if(this.recovery){
      const authority=await this.recovery.forPath(cwd);
      if(!authority){
        if(this.config.some(p=>localKey(cwd)===localKey(p.root)||localKey(cwd).startsWith(localKey(p.root)+sep)))fail('RECOVERY_STALE_CONTEXT');
        fail('UNAUTHORIZED');
      }
      await this.recovery.ready(authority);
      const index=this.projects.findIndex(p=>p.recoveryProjectId===authority.id);
      if(index<0)fail('UNAUTHORIZED');
      let project=this.projects[index];
      if(authority.memoryKey!==project.key)fail('RECOVERY_AUTHORITY_INVALID');
      const target=await this.fs.resolve(cwd,{signal:exec.signal});
      const rootTarget=await this.fs.resolve(authority.root,{signal:exec.signal});
      if(!this.fs.contains(rootTarget,target))fail('RECOVERY_STALE_CONTEXT');
      if(project.recoveryGeneration!==authority.generation||!sameRecoveryRoot(project.root,authority.root)||!project.target){
        project={...project,root:authority.root,target:rootTarget,recoveryGeneration:authority.generation,recoveryState:'ready'};
        this.projects[index]=project;
      }
      await this.assertProject(project);checkAbort(exec.signal);return project;
    }
    const target = await this.fs.resolve(cwd, { signal: exec.signal });
    const found = this.projects.find(p => this.fs.contains(p.target, target));
    if (!found) fail('UNAUTHORIZED', 'Caller is outside configured projects');
    return found;
  }
  async assertProject(project){
    if(!this.recovery)return project;
    if(!this.projects.includes(project))fail('RECOVERY_STALE_CONTEXT');
    await this.recovery.assert(project);return project;
  }
  async refreshRecoveryProjects(projectKey){
    if(!this.recovery)return;
    for(let index=0;index<this.projects.length;index++){
      const project=this.projects[index];if(projectKey!==undefined&&project.key!==projectKey)continue;
      const authority=await this.recovery.byId(project.recoveryProjectId);
      if(authority.id!==project.recoveryProjectId||authority.memoryKey!==project.key)fail('RECOVERY_AUTHORITY_INVALID');
      if(authority.state==='ready')await this.recovery.ready(authority);
      if(project.recoveryGeneration===authority.generation&&sameRecoveryRoot(project.root,authority.root)&&project.recoveryState===authority.state)continue;
      const target=authority.state==='ready'?await this.fs.resolve(authority.root):null;
      this.projects[index]={...project,root:authority.root,target,recoveryGeneration:authority.generation,recoveryState:authority.state};
    }
  }
  async resolve(project, path, signal) {
    checkAbort(signal);
    if(this.recovery)await this.assertProject(project);
    if (typeof path !== 'string' || !path || path.length > 2048 || isAbsolute(path) || /[:\0]/.test(path)) fail('UNAUTHORIZED', 'Use a relative source path');
    const pieces = path.replaceAll('\\','/').split('/');
    if (pieces.some(p => p === '..' || excluded(p) || (process.platform === 'win32' && /[. ]$/.test(p) && p !== '.'))) fail('UNAUTHORIZED', 'Path is outside allowed sources');
    let current = project.root;
    for (const piece of pieces.filter(p => p && p !== '.')) {
      current = join(current,piece);
      if ((await this.fs.lstat(current, {}, signal))?.type === 'symlink') fail('UNAUTHORIZED', 'Symbolic links are not sources');
    }
    const target = await this.fs.resolve(current, { signal });
    if (!this.fs.contains(project.target,target)) fail('UNAUTHORIZED', 'Canonical path escaped project');
    return target;
  }
  async authorizedSource(project, path, signal) {
    const target = await this.resolve(project,path,signal);
    let authorized = false;
    for (const configured of project.sources) {
      const root = await this.resolve(project,configured,signal);
      if (this.fs.contains(root,target)) authorized = true;
    }
    if (!authorized) fail('UNAUTHORIZED', 'Source has not been configured');
    return target;
  }
  async source(project,path,signal){
    const target=await this.authorizedSource(project,path,signal);
    if(this.isDocumentExcluded(project,path))fail('DOCUMENT_EXCLUDED','This source was permanently removed from the suite');
    return target;
  }
  async bytes(project, path, signal, maxBytes = 8 * 1024 * 1024) {
    const target = await this.source(project,path,signal);
    const before = await this.fs.stat(target,signal);
    if (!before) fail('NOT_FOUND');
    if (before.type !== 'file') fail('NOT_A_FILE');
    if (before.size > maxBytes) fail('TOO_LARGE');
    const beforeIdentity=await localFileIdentity(this.fs,target,before,signal);
    const [volumeSerialNumber,fileId]=beforeIdentity.split(':');
    if(this.isDocumentExcluded(project,path,{volumeSerialNumber,fileId}))fail('DOCUMENT_EXCLUDED');
    const bytes = await this.fs.readBytes(target, signal, maxBytes);
    const afterTarget = await this.source(project,path,signal);
    const after = await this.fs.stat(afterTarget,signal);
    if (target.targetKey !== afterTarget.targetKey || !after || before.version !== after.version) fail('SOURCE_CHANGED');
    if(beforeIdentity!==await localFileIdentity(this.fs,afterTarget,after,signal))fail('SOURCE_CHANGED');
    if(this.isDocumentExcluded(project,path,{volumeSerialNumber,fileId}))fail('DOCUMENT_EXCLUDED');
    return bytes;
  }
  async files(project, signal) {
    const found = new Map(); let visited = 0;
    const visit = async (path, depth) => {
      checkAbort(signal); if (++visited > 2000 || depth > 24) fail('TOO_MANY_FILES');
      if(this.isDocumentExcluded(project,path))return;
      const target = await this.source(project,path,signal);
      const info = await this.fs.stat(target,signal);
      if (!info) return;
      if (info.type === 'file') {
        const [volumeSerialNumber,fileId]=(await localFileIdentity(this.fs,target,info,signal)).split(':');
        if(this.isDocumentExcluded(project,path,{volumeSerialNumber,fileId}))return;
        found.set(target.targetKey, path.replaceAll('\\','/')); return;
      }
      if (info.type !== 'directory') return;
      for (const item of await this.fs.listDir(target,signal)) {
        if (excluded(item.name)) continue;
        await visit(join(path,item.name),depth+1);
      }
    };
    for (const source of project.sources) await visit(source,0);
    return [...found.values()].sort();
  }
}
