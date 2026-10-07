import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const update=join(import.meta.dirname,'shared/sep-update');
const require=createRequire(join(update,'prepare-profile.mjs'));
const yaml=createRequire(require.resolve('@deepseek-ai/dsh-app-boot/package.json'))('js-yaml');
import {rebaseOwned} from './transition.mjs';
const rebaseLiteral=(value,currentRoot,targetRoot,oldGraph,graph)=>rebaseOwned(value,currentRoot,targetRoot,oldGraph,graph,Object.fromEntries(oldGraph.packages.map(p=>[p.id,p.id])));
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Same inert native app-boot schema: only construct a data node. Never evaluate a JS expression.
const JsExpr=new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',resolve:data=>typeof data==='string',construct:data=>({__jsExpr:data})});
const nativeSchema=yaml.JSON_SCHEMA.extend(JsExpr);
export function parseProfileText(text,format){
 try {
  if(format==='json')return JSON.parse(text);
  if(format==='yaml')return yaml.load(text,{schema:nativeSchema});
  fail('SEP_PROFILE_FORMAT_UNSUPPORTED');
 }catch{fail('SEP_PROFILE_PARSE_UNSUPPORTED');}
}
function expressions(value,out=[],seen=new WeakSet()){
 if(!value||typeof value!=='object'||seen.has(value))return out;seen.add(value);
 if(typeof value.__jsExpr==='string')out.push(value.__jsExpr);
 for(const child of Object.values(value))expressions(child,out,seen);return out;
}
function refuseExpressionRelocation(beforeValue,currentRoot){
 const roots=[currentRoot,currentRoot.replaceAll('\\','/'),pathToFileURL(currentRoot).href];
 const boundaries=['\\','/',"'",'"',' ',')',',',';','\t','\n','\r'];
 for(const body of expressions(beforeValue))for(const root of roots){
  for(const needle of [root,JSON.stringify(root).slice(1,-1)]){
   let index=body.indexOf(needle);
   while(index>=0){const next=body[index+needle.length];if(next===undefined||boundaries.includes(next))fail('SEP_PROFILE_EXPRESSION_REBASE_UNSUPPORTED');index=body.indexOf(needle,index+needle.length);}
  }
 }
}
export function expectedProfileValue(beforeValue,{currentRoot,targetRoot,name,oldGraph,graph}){
 refuseExpressionRelocation(beforeValue,currentRoot);
 const value=rebaseLiteral(beforeValue,currentRoot,targetRoot,oldGraph,graph);
 if(name==='package.json'&&graph){value.dependencies={...value.dependencies};for(const [name,id]of Object.entries(graph.roots))value.dependencies[name]=graph.packages.find(p=>p.id===id).version;}
 return value;
}
function replaceScalar(raw,before,after){
 const lead=raw.match(/^\s*/)[0],tail=raw.match(/\s*$/)[0],token=raw.slice(lead.length,raw.length-tail.length);
 let next;
 if(token===before)next=after;
 else if(token===JSON.stringify(before))next=JSON.stringify(after);
 else if(token==="'"+before.replaceAll("'","''")+"'")next="'"+after.replaceAll("'","''")+"'";
 else if (/^[>|][+-]?\s*\r?\n/.test(token) && parseProfileText(token,'yaml')===before && raw.indexOf(before)>=0 && raw.indexOf(before)===raw.lastIndexOf(before)) {
  // Native YAML emitter may use a single-line folded URI. Preserve its block marker/indentation.
  return raw.replace(before,after);
 }
 else fail('SEP_PROFILE_SCALAR_FORMAT_UNSUPPORTED');
 return lead+next+tail;
}
function prepare(options){
 const {text,format,currentRoot,targetRoot,name,oldGraph,graph}=options;
 const beforeValue=parseProfileText(text,format),afterValue=expectedProfileValue(beforeValue,{currentRoot,targetRoot,name,oldGraph,graph}),tagged=expressions(beforeValue).length;
 if(isDeepStrictEqual(beforeValue,afterValue))return{text,beforeValue,afterValue,tagged,scalarEdits:0};
 if(format!=='yaml'||tagged===0)return{text:JSON.stringify(afterValue,null,2)+'\n',beforeValue,afterValue,tagged,scalarEdits:null};
 // Limit edits to parsed scalar spans. Comments and expression bodies are excluded.
 const stack=[],edits=[];
 yaml.load(text,{schema:nativeSchema,listener:(event,state)=>{
  if(event==='open'){stack.push(state.position);return;}
  const start=stack.pop();
  if(state.kind!=='scalar'||typeof state.result!=='string')return;
  const rebased=rebaseLiteral(state.result,currentRoot,targetRoot,oldGraph,graph);if(rebased===state.result)return;
  edits.push({start,end:state.position,text:replaceScalar(text.slice(start,state.position),state.result,rebased)});
 }});
 edits.sort((a,b)=>a.start-b.start);
 for(let i=1;i<edits.length;i++)if(edits[i-1].end>edits[i].start)fail('SEP_PROFILE_SCALAR_OVERLAP');
 let output=text;for(const edit of [...edits].reverse())output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
 const parsedAfter=parseProfileText(output,format);if(!isDeepStrictEqual(parsedAfter,afterValue))fail('SEP_PROFILE_SEMANTIC_CHANGE');
 if(!isDeepStrictEqual(expressions(parsedAfter),expressions(beforeValue)))fail('SEP_PROFILE_EXPRESSION_CHANGED');
 return{text:output,beforeValue,afterValue,tagged,scalarEdits:edits.length};
}
export function prepareProfileText(options){
 try{return prepare(options);}catch(error){const code=typeof error?.code==='string'&&/^SEP_PROFILE_[A-Z_]+$/.test(error.code)?error.code:'SEP_PROFILE_PREPARATION_UNSUPPORTED';fail(code);}
}

