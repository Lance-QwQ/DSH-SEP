import {mkdir,writeFile,readFile,copyFile,cp,chmod,realpath,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {release} from 'node:os';
import assert from 'node:assert/strict';
const exec=promisify(execFile),source=fileURLToPath(new URL('.',import.meta.url)),hash=x=>createHash('sha256').update(x).digest('hex');
assert(process.argv[2]);assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');const output=resolve(process.argv[2]);await mkdir(output,{mode:0o700});
async function command(exe,args,label,env=process.env){let r;try{r=await exec(exe,args,{env,timeout:180000,maxBuffer:2097152});}catch(e){r=e;}await writeFile(join(output,label+'.log'),String(r.stdout??'')+'\n'+String(r.stderr??''),{flag:'wx'});if(r.code!==undefined)throw r;return r;}
const system=await command('/usr/bin/sw_vers',[],'system');await writeFile(join(output,'platform.json'),JSON.stringify({platform:process.platform,arch:process.arch,darwin:release(),swVers:system.stdout,node:process.version},null,2),{flag:'wx'});
const python=process.env.SEP_MAC_PARSER_PYTHON,pythonHome=process.env.SEP_MAC_PARSER_PYTHON_HOME,deps=process.env.SEP_MAC_PARSER_DEPENDENCIES,bundle=process.env.SEP_MAC_BUNDLE_ROOT;
for(const p of [python,pythonHome,deps,bundle])assert(p?.startsWith('/'));
const py=JSON.parse((await command(python,['-I','-c','import json,sys;print(json.dumps({"version":list(sys.version_info[:3]),"prefix":sys.prefix}))'],'python')).stdout);assert.deepEqual(py.version,[3,12,14]);assert.equal(await realpath(pythonHome),await realpath(py.prefix));assert.equal(process.version,'v24.21.0');
const runtimeRoot=join(output,'runtime');await mkdir(runtimeRoot,{mode:0o700});await mkdir(join(runtimeRoot,'suite'),{mode:0o700});await mkdir(join(runtimeRoot,'node_modules'),{mode:0o700});
await cp(pythonHome,join(runtimeRoot,'python'),{recursive:true,dereference:true});await cp(deps,join(runtimeRoot,'node_modules'),{recursive:true,dereference:true});
const context=join(runtimeRoot,'context_resolver.py'),entry=join(runtimeRoot,'document-entry.mjs'),node=join(runtimeRoot,'node');await copyFile(process.execPath,node);await chmod(node,0o555);await copyFile(join(source,'context_resolver.py'),context);await copyFile(join(source,'document-entry.mjs'),entry);
const pinned={'parsers.js':'13ea4678c4554ee4e422eebff90af760452eeda701571b3686a66b8ccc5f6599','parser-worker.js':'f064624031f0d09511579f288d9fcbf370a2707f6883af0d46adaf973a2f0d6f','errors.js':'bbeb606e67ab37f26515e5ab5848a5120fa4cb1ba7afc12ca1f7c3e0db91bfb3'};
for(const [name,digest]of Object.entries(pinned)){const body=await readFile(join(bundle,'modules/system-enhancement-package/src',name));assert.equal(hash(body),digest);await writeFile(join(runtimeRoot,'suite',name),body,{mode:0o444});}
await writeFile(join(runtimeRoot,'package.json'),'{"type":"module"}\n',{mode:0o444});await chmod(context,0o444);await chmod(entry,0o444);await chmod(runtimeRoot,0o555);
const pyexe=join(runtimeRoot,'python/bin/python3.12');assert((await stat(pyexe)).isFile());await chmod(pyexe,0o555);
const ownerPath=join(output,'task-owner'),helperPath=join(output,'native-tree');for(const [input,target]of [['../task-sandbox/task-owner.c',ownerPath],['../apfs-tree/native-tree.c',helperPath]]){await command('/usr/bin/clang',['-O2','-Wall','-Wextra','-Werror',join(source,input),'-o',target],'compile-'+target.split('/').at(-1));await chmod(target,0o555);}
const fixture={output,runtimeRoot,ownerPath,ownerSha256:hash(await readFile(ownerPath)),helperPath,helperSha256:hash(await readFile(helperPath)),'context-python':{executable:pyexe,executableSha256:hash(await readFile(pyexe)),parserPath:context,parserSha256:hash(await readFile(context))},'document-node':{executable:node,executableSha256:hash(await readFile(node)),parserPath:entry,parserSha256:hash(await readFile(entry))}};
const manifest=join(output,'fixture.json');await writeFile(manifest,JSON.stringify(fixture,null,2),{flag:'wx'});const errors=[];
try{await command(process.execPath,['--test',join(source,'parser-contract.test.mjs')],'contract');}catch(e){errors.push(e);}
try{await command(process.execPath,['--test',join(source,'document-entry.test.mjs')],'entry',{...process.env,SEP_PARSER_ENTRY_TEST_ROOT:join(output,'entry-cases')});}catch(e){errors.push(e);}
try{await command(process.execPath,['--test',join(source,'parser-native.test.mjs')],'native',{...process.env,SEP_MAC_PARSER_FIXTURE:manifest});}catch(e){errors.push(e);}
if(errors.length)throw new AggregateError(errors,'PARSER_TESTS_FAILED');
