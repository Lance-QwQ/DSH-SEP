// Prepare new program/config only; never edit a daily pointer or private data.
import assert from 'node:assert/strict';import{readFile,writeFile,cp}from'node:fs/promises';import{join,resolve}from'node:path';import{spawn}from'node:child_process';
const phase=process.env.SEP_BUNDLE_TEST_ROOT,program=join(phase,'alpha2-runtime-r6'),source=join(phase,'alpha2-runtime-r5');
await cp(source,program,{recursive:true,errorOnExist:true,force:false,filter:path=>{const rel=path.slice(source.length).replaceAll('\\','/');return rel!=='/graph.json'&&rel!=='/daily-adapter'&&!rel.startsWith('/daily-adapter/');}});
const path=join(phase,'tools/daily-adaptation/build/prepare-daily-candidate.mjs');let code=await readFile(path,'utf8');
const edits=[];function replace(from,to){assert.equal(code.split(from).length,2,'CANDIDATE_BUILDER_ANCHOR');code=code.replace(from,to);edits.push({from,to});}
const dailyAnchor=code.match(/daily='[^']*'/g);assert.equal(dailyAnchor?.length,1);replace(dailyAnchor[0],"daily=process.env.SEP_RETAINED_DAILY_ROOT");
replace("const {auditDesktopPayload}=await import(pathToFileURL(join(launcher,'desktop-payload.mjs'))),desktopRuntimeRoot=await realpath(join(current.releaseRoot,'node_modules/electron/dist'));", "const {auditDesktopPayload}=await import(pathToFileURL(join(launcher,'desktop-payload.mjs'))),desktopRuntimeRoot=await realpath(process.env.SEP_DAILY_ELECTRON_PAYLOAD);");
replace("if(isAbsolute(electronRelative)||electronRelative==='..'||electronRelative.startsWith('..\\\\'))throw Error('DAILY_ELECTRON_OUTSIDE_SOURCE_GRAPH');", "if(desktopRuntimeRoot!==await realpath(join(base,'electron-44.7.0')))throw Error('DAILY_ELECTRON_OUTSIDE_VERIFIED_PAYLOAD');");
replace("version:'44.0.0'","version:'44.7.0'");
const out=join(phase,'tools/daily-adaptation/build/prepare-daily-candidate-current.mjs');await writeFile(out,code,{flag:'wx'});await writeFile(join(phase,'CANDIDATE-BUILDER-ORIGIN-r1.json'),JSON.stringify({source:path,transforms:edits},null,2)+'\n',{flag:'wx'});
const child=spawn(process.execPath,[out,'r1'],{env:{...process.env,SEP_DAILY_MANAGED_HOST:program},stdio:'inherit',windowsHide:true});process.exitCode=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',res);});
