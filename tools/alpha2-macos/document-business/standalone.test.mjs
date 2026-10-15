import {frozen,transform,evaluate} from './derive.mjs';
const file=new URL('../business/standalone.test.mjs',import.meta.url),source=await frozen(file,'df88909b01ec71b0611e4a66a4a829016553219b844f8b0a0fb1e96a185a7b9e');
const derived=transform(source,[
 {before:'real native macOS official web profile',after:'real native macOS combined image/document/settings web profile'},
 {before:'SEP_MAC_BUSINESS_TEST_ROOT',after:'SEP_DOCUMENT_TEST_ROOT',count:2},
 {before:' const input={programRoot:',after:" const parserBinding=JSON.parse(await readFile(process.env.SEP_PARSER_ASSEMBLY_FIXTURE,'utf8'));\n const input={programRoot:"},
 {before:'helperSha256:hash(await readFile(process.env.SEP_MAC_TREE_HELPER)),initialize:true',after:"helperSha256:hash(await readFile(process.env.SEP_MAC_TREE_HELPER)),attachmentHelperPath:process.env.SEP_MAC_ATTACHMENT_HELPER,attachmentHelperSha256:hash(await readFile(process.env.SEP_MAC_ATTACHMENT_HELPER)),parser:{runtimeRoot:parserBinding.runtimeRoot,manifestSha256:parserBinding.manifestSha256,stateRoot:join(base,'data/parser')},initialize:true"},
 {before:'assert.equal(ready.authenticatedUrlPresent,true);',after:"assert.equal(ready.authenticatedUrlPresent,true);assert.deepEqual(ready.settings,{status:'pass',fiberActive:true,clientAdvertised:true,staticClientServed:true,memoryAvailable:true,budgetAvailable:true});"},
 {before:"new URL('./standalone-probe.mjs',import.meta.url)",after:'new URL('+JSON.stringify(new URL('./standalone-probe.mjs',import.meta.url).href)+')'},
 {before:'import.meta.url',after:JSON.stringify(import.meta.url)},
]);
await evaluate(derived.source,file);
