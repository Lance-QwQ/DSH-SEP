import {frozen,transform,evaluate} from './derive.mjs';
import {prepareParser} from './fixture-prepare.mjs';
const file=new URL('../media-business/fixture.mjs',import.meta.url),source=await frozen(file,'2251e58c979bb6ed36639bb40721a5fb2e695f3471736d2b22b6710f428da378');
const runtime=process.env.SEP_DOCUMENT_REAL_PARSER==='1'?'./runtime.mjs':'./test-runtime.mjs';
const extra=[
 ["runtimeOptions={},loader=false,imageCapable=true,imagePricing,agentMaxTokens=64}={})","runtimeOptions={},loader=false,imageCapable=true,imagePricing,agentMaxTokens=64,prepare}={})"],
 ["const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;","const prepared=await prepare({base,source,memory,budgetPath});\n const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;"],
 ['...runtimeOptions};let fiber;','...runtimeOptions,...prepared};let fiber;'],
 ['process.env.SEP_MAC_MEDIA_TEST_ROOT','process.env.SEP_DOCUMENT_TEST_ROOT',2],
];
const derived=transform(source,[
 {before:'"new URL(\'./runtime.mjs\',import.meta.url).href"',after:'"__frozen_fixture_runtime_anchor__"'},
 {before:"new URL('./runtime.mjs',import.meta.url)",after:'new URL('+JSON.stringify(runtime)+',import.meta.url)',count:2},
 {before:"new URL('./cold-attachments.mjs',import.meta.url)",after:"new URL('../media-business/cold-attachments.mjs',import.meta.url)"},
 {before:'import.meta.url',after:JSON.stringify(import.meta.url),count:4},
 {before:'"__frozen_fixture_runtime_anchor__"',after:'"new URL(\'./runtime.mjs\',import.meta.url).href"'},
 {before:'for(const [before,after,count=1]of swaps)',after:'swaps.push(...'+JSON.stringify(extra)+');\nfor(const [before,after,count=1]of swaps)'},
]);
const implementation=await evaluate(derived.source,file);
export const ok=implementation.ok;
export async function setup(options={}){return implementation.setup({...options,prepare:async state=>({...await prepareParser(state),...await options.prepare?.(state)})});}
