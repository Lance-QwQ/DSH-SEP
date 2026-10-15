import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {redactBuildLabels} from './redact-labels.mjs';
test('bundler comments and function labels lose absolute build paths but retain behavior',()=>{
 const source='// D:/AIData/ProjectWork/DSH/lab/source-r1/desktop-source/src/a.js\nconst f={\n"D:/AIData/ProjectWork/DSH/lab/host-alpha2/node_modules/a/index.js"(x){return x+1;}\n};globalThis.result=Object.values(f)[0](3);\n';
 const out=redactBuildLabels(source);assert.equal(out.count,2);assert.doesNotMatch(out.text,/AIData|D:\//);const c={};vm.runInNewContext(out.text,c);assert.equal(c.result,4);
});
test('CSS region labels support Windows separators',()=>{const r=redactBuildLabels('\t//#region \\0dsh-css:D:\\AIData\\ProjectWork\\DSH\\lab\\source-r1\\desktop-source\\packages\\a.css.mjs\n');assert.equal(r.count,1);assert.doesNotMatch(r.text,/AIData/);assert.match(r.text,/packages\/a.css/);});
test('executable path literals are never silently replaced',()=>assert.throws(()=>redactBuildLabels('const file="D:/AIData/ProjectWork/DSH/lab/host-alpha2/node_modules/a";'),{code:'PACKAGE_BUILD_PATH_NOT_LABEL'}));
test('unknown build roots refuse rather than make up provenance',()=>assert.throws(()=>redactBuildLabels('// D:/AIData/ProjectWork/DSH/unrecognized/private.txt\n'),{code:'PACKAGE_BUILD_LABEL_UNKNOWN'}));
test('known upstream and Alpha.2 generator labels are recognized explicitly',()=>{for(const suffix of ['official-source/deepseek-harness-dsh-v0.2.1-alpha.2/apps/a.ts','alpha2-runtime-r2/node_modules/react/index.js','tools/daily-adaptation/lib/daily-startup.mjs'])assert.equal(redactBuildLabels('// D:/AIData/ProjectWork/DSH/lab/'+suffix+'\n').count,1);});
