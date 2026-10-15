import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {stableFile} from './bundle-audit.mjs';
const under=(root,path)=>{const r=relative(root,path);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\');};
export async function runtimeSmoke(config,output){
 assert(under('D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1',output));await mkdir(output);
 const root=join(config.dailyRoot,'runtime/primary-runtime'),manifestRecord=await stableFile(join(root,'runtime.json'),{maxBytes:1048576,capture:true}),manifest=JSON.parse(manifestRecord.bytes);
 assert.equal(manifest.platform,'win32');assert.equal(manifest.arch,'x64');assert.equal(manifest.node,'24.21.0');assert.equal(manifest.pnpm,'11.7.0');assert.match(manifest.python,/^3\.\d+\.\d+$/);
 const python=join(root,'dependencies/python/python.exe'),primaryNode=join(root,'dependencies/node/bin/node.exe'),primaryPnpm=join(root,'dependencies/pnpm/bin/pnpm.cjs');
 for(const path of [python,primaryNode,primaryPnpm,config.nodeExecutable,config.pnpmEntry]){assert(under(config.dailyRoot,path));assert((await lstat(path)).isFile());}
 const commands=[];
 async function run(label,exe,args){
  const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:join(config.dailyRoot,'runtime/node')+';'+join(process.env.SystemRoot,'System32'),HOME:config.runtimeUser,USERPROFILE:config.runtimeUser,APPDATA:join(config.runtimeUser,'roaming'),LOCALAPPDATA:join(config.runtimeUser,'local'),TEMP:output,TMP:output,COREPACK_ENABLE_NETWORK:'0',PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1'};
  const child=spawn(exe,args,{cwd:output,env,windowsHide:true,stdio:['ignore','pipe','pipe']}),out=[],err=[];let size=0,timeout=false,overflow=false,settled=false,killTimer;
  function data(to,chunk){size+=chunk.length;if(size>4*1024*1024){overflow=true;child.kill();}else to.push(chunk);}
  child.stdout.on('data',b=>data(out,b));child.stderr.on('data',b=>data(err,b));
  const result=await new Promise((ok,no)=>{const timer=setTimeout(()=>{timeout=true;child.kill();killTimer=setTimeout(()=>{if(!settled){child.unref();no(Error('VERIFY_RUNTIME_CLEANUP_UNCONFIRMED'));}},10000);},120000);child.once('error',e=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);no(e);});child.once('close',(code,signal)=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);ok({code,signal});});});
  await writeFile(join(output,label+'.stdout.log'),Buffer.concat(out),{flag:'wx'});await writeFile(join(output,label+'.stderr.log'),Buffer.concat(err),{flag:'wx'});
  commands.push({label,executable:exe,exit:result,timeout,overflow});assert.deepEqual(result,{code:0,signal:null});assert.equal(timeout,false);assert.equal(overflow,false);return Buffer.concat(out).toString('utf8').trim();
 }
 assert.equal(await run('node',config.nodeExecutable,['--version']),'v24.21.0');
 assert.equal(await run('pnpm',config.nodeExecutable,[config.pnpmEntry,'--version']),'11.7.0');
 assert.equal(await run('primary-node',primaryNode,['--version']),'v24.21.0');
 assert.equal(await run('primary-pnpm',primaryNode,[primaryPnpm,'--version']),'11.7.0');
 const code=`import sys,json,platform,sqlite3,ssl,hashlib,zipfile,importlib,importlib.metadata\nmodules={'numpy':'numpy','pandas':'pandas','python-dateutil':'dateutil','six':'six','tzdata':'tzdata','python-docx':'docx','python-pptx':'pptx','openpyxl':'openpyxl','Pillow':'PIL','lxml':'lxml','XlsxWriter':'xlsxwriter','typing_extensions':'typing_extensions','et_xmlfile':'et_xmlfile'}\nfor name in modules.values(): importlib.import_module(name)\nprint(json.dumps({'version':platform.python_version(),'executable':sys.executable,'prefix':sys.prefix,'packages':{name:importlib.metadata.version(name) for name in modules},'basicImports':['json','sqlite3','ssl','hashlib','zipfile'],'sqliteVersion':sqlite3.sqlite_version}))`;
 const observed=JSON.parse(await run('python-imports',python,['-I','-B','-c',code]));assert.equal(observed.version,manifest.python);assert.equal(resolve(observed.executable),python);assert.equal(resolve(observed.prefix),join(root,'dependencies/python'));
 for(const [name,version]of Object.entries(manifest.pythonPackages??{}))assert.equal(observed.packages[name],version,name+' differs from the shipped runtime manifest');
 const result={schema:1,status:'pass',scope:'Actual installed runtime executables and offline bundled imports; no package install, network or paid model request.',manifestSha256:manifestRecord.sha256,runtimeManifestDesktopVersion:manifest.desktopVersion,node:'24.21.0',pnpm:'11.7.0',python:observed,commands};
 await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
