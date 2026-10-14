// Test-only substitution: no synthetic parser provider is reachable from the
// production runtime/configuration. Native mode uses the real service module.
import {frozen,transform,evaluate} from './derive.mjs';
const file=new URL('../business/fixture.mjs',import.meta.url),source=await frozen(file,'1d5ab2a4a96b37655daf64bd5f275ae84a7706466718dd179e0fd438013977e2');
const entry=process.env.SEP_DOCUMENT_BASELINE==='1'?'../business/runtime.mjs':'./test-runtime.mjs';
const derived=transform(source,[
 {before:"import * as runtime from './runtime.mjs';",after:"import * as runtime from '"+new URL(entry,import.meta.url).href+"';"},
 {before:"new URL('./runtime.mjs',import.meta.url).href",after:"'"+new URL(entry,import.meta.url).href+"'"},
 {before:'process.env.SEP_MAC_BUSINESS_TEST_ROOT',after:'process.env.SEP_DOCUMENT_TEST_ROOT',count:2},
 {before:'runtimeOptions={},loader=false}={})',after:'runtimeOptions={},loader=false,prepare=async()=>({})}={})'},
 {before:'const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;',after:'const prepared=await prepare({base,source,memory,budgetPath});\n const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;'},
 {before:'...runtimeOptions};let fiber;',after:'...runtimeOptions,...prepared};let fiber;'},
]);
export const {setup,ok}=await evaluate(derived.source,file);
