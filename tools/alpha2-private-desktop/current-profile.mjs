import{resolve,relative,isAbsolute,sep,join}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';
const fail=code=>{throw Object.assign(Error(code),{code});};
/** Pure conversion of the already-selected Alpha.1 profile, never legacy suite
 * intent. Preserve all runtime controls and unrelated plugin rows exactly. */
export function retargetCurrentProfile({selection,patches,sourceRoot,targetRoot}){
 if(selection?.schema!==2||selection.dsh!=='0.2.1-alpha.1'||selection.sep!=='0.2.1-beta.3-bundle.24'||!selection.configuration?.runtime||typeof selection.nativeCompactionEntryKey!=='string'||!Array.isArray(patches)||!isAbsolute(sourceRoot??'')||!isAbsolute(targetRoot??''))fail('CURRENT_PROFILE_UNSUPPORTED');
 const source=resolve(sourceRoot),target=resolve(targetRoot),transforms=[];
 function entry(row,location){
  if(!row||typeof row!=='object'||Array.isArray(row))fail('CURRENT_PROFILE_UNSUPPORTED');
  if(typeof row.name==='string'){
   let path,isUrl=false;try{if(row.name.startsWith('file:')){path=fileURLToPath(row.name);isUrl=true;}else if(isAbsolute(row.name))path=row.name;}catch{fail('CURRENT_PROFILE_UNSUPPORTED');}
   if(path){const part=relative(source,resolve(path));if(part!==''&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('..'+sep)){const before=row.name;row.name=isUrl?pathToFileURL(join(target,part)).href:join(target,part);transforms.push({location,from:before,to:row.name});}}
  }
  if(row.insert!==undefined){if(!Array.isArray(row.insert))fail('CURRENT_PROFILE_UNSUPPORTED');row.insert.forEach((child,i)=>entry(child,location+'.insert['+i+']'));}
 }
 const result=structuredClone(patches);result.forEach((row,i)=>entry(row,'patches['+i+']'));
 return{patches:result,configuration:structuredClone(selection.configuration),nativeEntryKey:selection.nativeCompactionEntryKey,transforms};
}
