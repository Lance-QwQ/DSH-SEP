import {mkdir,lstat,realpath} from 'node:fs/promises';
import {posix} from 'node:path';
import {release} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyParserRuntime} from './runtime.mjs';
import {createTrustedParser} from '../parser/trusted-parser.mjs';
import {platformSupported} from '../parser/parser-contract.mjs';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {aggregateParserServices} from './lifecycle.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});},exec=promisify(execFile);
const inside=(a,b)=>a===b||b.startsWith(a+'/');
async function privateDirectory(p){try{await mkdir(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}const s=await lstat(p,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==BigInt(process.getuid())||(s.mode&0o777n)!==0o700n||await realpath(p)!==p)fail('SEP_PARSER_STATE');return [s.dev,s.ino].join(':');}
/** Trusted composition only. No parser code or command is accepted from tools.
 * Caller already holds the application instance lease for stateRoot. */
export async function openParserServices({runtimeRoot,manifestSha256,stateRoot}){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_PARSER_PLATFORM_UNVERIFIED');
 const options={env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},timeout:3000,maxBuffer:4096};const version=(await exec('/usr/bin/sw_vers',['-productVersion'],options)).stdout.trim(),build=(await exec('/usr/bin/sw_vers',['-buildVersion'],options)).stdout.trim();
 if(!platformSupported({platform:process.platform,arch:process.arch,version,build,darwin:release()}))fail('SEP_MAC_PARSER_PLATFORM_UNVERIFIED');
 const manifest=await verifyParserRuntime({runtimeRoot,manifestSha256}),rows=new Map(manifest.entries.filter(e=>e.kind==='file').map(e=>[e.path,e]));
 if(typeof stateRoot!=='string'||stateRoot==='/'||!posix.isAbsolute(stateRoot)||posix.normalize(stateRoot)!==stateRoot||/[\x00-\x1f\x7f"\\]/.test(stateRoot)||inside(runtimeRoot,stateRoot)||inside(stateRoot,runtimeRoot)||await realpath(posix.dirname(stateRoot))!==posix.dirname(stateRoot))fail('SEP_PARSER_STATE');
 const identity=await privateDirectory(stateRoot),parsers=[],binding={runtimeRoot,manifestSha256,stateRoot};
 try{for(const [kind,prefix,exe,entry]of [['context-python','context','python/bin/python3.12','context_resolver.py'],['document-node','document','node','document-entry.mjs']]){
  const scratchRoot=posix.join(stateRoot,prefix+'-scratch'),authorityRoot=posix.join(stateRoot,prefix+'-authority');await privateDirectory(scratchRoot);await privateDirectory(authorityRoot);if(await privateDirectory(stateRoot)!==identity)fail('SEP_PARSER_STATE');
  const helper=rows.get('native/native-tree'),owner=rows.get('native/task-owner'),binary=rows.get('tool-runtime/'+exe),parser=rows.get('tool-runtime/'+entry);if(!helper||!owner||!binary||!parser)fail('SEP_PARSER_MANIFEST_CHANGED');
  const io=createProjectTree({helperPath:posix.join(runtimeRoot,helper.path),helperSha256:helper.sha256,lockPath:posix.join(authorityRoot,'.native.lock')});
  const api=await createTrustedParser({kind,runtimeRoot:posix.join(runtimeRoot,'tool-runtime'),scratchRoot,authorityRoot,ownerPath:posix.join(runtimeRoot,owner.path),ownerSha256:owner.sha256,executable:posix.join(runtimeRoot,binary.path),executableSha256:binary.sha256,parserPath:posix.join(runtimeRoot,parser.path),parserSha256:parser.sha256},io);
  parsers.push(api);
 }}catch(error){const unknown=/(?:CLEANUP_UNCONFIRMED|RECORD_UNCONFIRMED)$/.test(error?.code??''),cleanup=await aggregateParserServices(parsers,binding,unknown).close();throw Object.assign(Error('SEP_PARSER_INITIALIZATION_FAILED'),{code:'SEP_PARSER_INITIALIZATION_FAILED',cause:error,cleanup});}
 return aggregateParserServices(parsers,binding);
}
