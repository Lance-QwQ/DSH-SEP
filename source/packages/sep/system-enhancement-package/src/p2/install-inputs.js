import {isAbsolute,resolve,dirname} from 'node:path';

const SUITE='dsh-system-enhancement-package';
const reject=message=>{throw Object.assign(new Error(message),{code:'P2_INPUT_MISMATCH'});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function text(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{reject('Install inputs must be valid UTF-8 bytes.');}}
function scalar(value){
  value=value.trim();
  if(value.startsWith('"')){try{const result=JSON.parse(value);if(typeof result==='string')return result;}catch{}reject('Unsupported quoted lock scalar.');}
  if(value.startsWith("'")){if(!/^'(?:[^']|'')*'$/.test(value))reject('Unsupported quoted lock scalar.');return value.slice(1,-1).replaceAll("''", "'");}
  if(!value||/^[&*!|>\[{]/.test(value)||/\s#/.test(value))reject('Unsupported lock scalar.');
  return value;
}
const quote=value=>`'${value.replaceAll("'","''")}'`;
function local(ref){if(typeof ref!=='string'||!ref.startsWith('file:')||ref.startsWith('file://')||!ref.slice(5)||/[\r\n\0()]/.test(ref))reject('Only unambiguous local tarball references without peer contexts are supported.');return ref;}
const normalizedPath=path=>{const absolute=resolve(path);return process.platform==='win32'?absolute.toLowerCase():absolute;};
function referencePath(ref,ownerPath){const path=local(ref).slice(5);if(/^[A-Za-z]:(?![\\/])/.test(path))reject('Drive-relative package references are ambiguous.');return normalizedPath(resolve(dirname(ownerPath),path));}
function mapKeys(lines,start,end,indent){
  const entries=[];
  for(let i=start;i<end;i++){
    const line=lines[i];if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const spaces=line.match(/^ */)[0].length;if(spaces!==indent)continue;
    const match=line.match(/^( *)(.+):(?:\s*\{\})?\s*$/);if(!match)reject('Unsupported mapping syntax in the selected lock block.');
    const key=scalar(match[2]);if(entries.some(entry=>entry.key===key))reject('Duplicate lock mapping key.');
    let limit=i+1;while(limit<end&&(!lines[limit].trim()||lines[limit].trimStart().startsWith('#')||lines[limit].match(/^ */)[0].length>indent))limit++;
    entries.push({key,index:i,start:i+1,end:limit});
  }return entries;
}
function block(lines,parent,indent,key){const matches=mapKeys(lines,parent.start,parent.end,indent).filter(entry=>entry.key===key);if(matches.length!==1)reject(`Required unique lock block is missing: ${key}`);return matches[0];}
function field(lines,parent,indent,key){
  const prefix=' '.repeat(indent)+key+':';const matches=[];
  for(let i=parent.start;i<parent.end;i++)if(lines[i].startsWith(prefix))matches.push({index:i,value:scalar(lines[i].slice(prefix.length))});
  if(matches.length!==1)reject(`Required unique lock field is missing: ${key}`);return matches[0];
}
function suiteRecord(lines,parent,oldKey){
  const matches=mapKeys(lines,parent.start,parent.end,2).filter(entry=>entry.key.startsWith(SUITE+'@'));
  if(matches.length!==1||matches[0].key!==oldKey)reject('A unique suite package and snapshot without peer contexts are required.');return matches[0];
}

/** Bind already reviewed, unchanged dependency graphs to an inspected sealed
 * tarball. This does not resolve dependencies or approve semantic compatibility. */
export function bindInstallInputs({manifestBytes,lockBytes,artifact,requireExistingBinding}={}){
  if(!object(artifact)||artifact.manifest?.name!==SUITE||typeof artifact.manifest.version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(artifact.manifest.version)||typeof artifact.path!=='string'||!isAbsolute(artifact.path)||typeof artifact.integrity!=='string'||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(artifact.integrity))reject('An inspected suite artifact with absolute path and sha512 integrity is required.');
  if(requireExistingBinding!==undefined&&(!object(requireExistingBinding)||Object.keys(requireExistingBinding).length!==2||['manifestPath','lockPath'].some(key=>typeof requireExistingBinding[key]!=='string'||!isAbsolute(requireExistingBinding[key])||/[\r\n\0]/.test(requireExistingBinding[key]))))reject('Existing binding requires only the absolute manifest and lock file paths.');
  let profile;try{profile=JSON.parse(text(manifestBytes));}catch(error){if(error.code==='P2_INPUT_MISMATCH')throw error;reject('Invalid Profile package manifest.');}
  if(!object(profile)||!object(profile.dependencies))reject('A Profile dependency manifest is required.');
  const ref=local(profile.dependencies[SUITE]);
  for(const category of ['devDependencies','optionalDependencies','peerDependencies'])if(profile[category]?.[SUITE]!==undefined)reject('The suite must occur only in Profile dependencies.');
  const lock=text(lockBytes);if(/\t|\r(?!\n)/.test(lock))reject('Unsupported lock whitespace.');
  const newline=lock.includes('\r\n')?'\r\n':'\n';if(newline==='\r\n'&&lock.replaceAll('\r\n','').includes('\n'))reject('Mixed lock line endings are unsupported.');
  const lines=lock.split(newline),root={start:0,end:lines.length};
  const rootKeys=new Set();
  for(const line of lines.filter(line=>line.trim()&&!line.startsWith(' ')&&!line.startsWith('#'))){
    const match=line.match(/^([A-Za-z][A-Za-z0-9]*):(?:\s|$)/);
    if(!match||!['lockfileVersion','settings','importers','packages','snapshots'].includes(match[1])||rootKeys.has(match[1]))reject('Unsupported or duplicate lock root.');rootKeys.add(match[1]);
  }
  if(field(lines,root,0,'lockfileVersion').value!=='9.0')reject('Only the reviewed pnpm 9.0 format is supported.');
  // Top-level scalar fields are excluded from mapping traversal deliberately.
  const findRoot=key=>{
    const indices=lines.flatMap((line,index)=>line===key+':'?[index]:[]);if(indices.length!==1)reject(`Required unique lock root is missing: ${key}`);
    const index=indices[0];let end=index+1;while(end<lines.length&&(!lines[end].trim()||lines[end].startsWith(' ')||lines[end].trimStart().startsWith('#')))end++;
    return {index,start:index+1,end};
  };
  const importer=block(lines,findRoot('importers'),2,'.');
  const dependencies=block(lines,importer,4,'dependencies'),suite=block(lines,dependencies,6,SUITE);
  for(let i=suite.start;i<suite.end;i++)if(lines[i].trim()&&!lines[i].trimStart().startsWith('#')&&!/^        (?:specifier|version):\s/.test(lines[i]))reject('Unsupported suite importer field.');
  const specifier=field(lines,suite,8,'specifier'),version=field(lines,suite,8,'version');
  if(specifier.value!==ref)reject('The suite lock specifier must match the Profile manifest.');local(version.value);
  const oldKey=SUITE+'@'+version.value;
  const pkg=suiteRecord(lines,findRoot('packages'),oldKey),snapshot=suiteRecord(lines,findRoot('snapshots'),oldKey);
  const packageVersion=field(lines,pkg,4,'version');
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(packageVersion.value))reject('Unsupported existing suite package version.');
  const resolutionLines=[];for(let i=pkg.start;i<pkg.end;i++)if(lines[i].startsWith('    resolution:'))resolutionLines.push(i);
  if(resolutionLines.length!==1)reject('A unique suite resolution is required.');
  const resolutionIndex=resolutionLines[0],resolution=lines[resolutionIndex].match(/^    resolution:\s*\{integrity:\s*(.+?),\s*tarball:\s*(.+)\}\s*$/);
  if(!resolution||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(scalar(resolution[1]))||scalar(resolution[2])!==version.value)reject('The existing suite resolution must bind its exact lock reference.');
  if(requireExistingBinding!==undefined){
    const expected=normalizedPath(artifact.path);
    // The specifier already equals the manifest reference; the resolved lock
    // version and tarball are coordinates relative to the lock file itself.
    if(referencePath(ref,requireExistingBinding.manifestPath)!==expected||referencePath(version.value,requireExistingBinding.lockPath)!==expected||packageVersion.value!==artifact.manifest.version||scalar(resolution[1])!==artifact.integrity)reject('Current install inputs do not already bind the exact confirmed artifact, version and integrity.');
  }
  const selected=new Set([suite.index,specifier.index,version.index,pkg.index,packageVersion.index,resolutionIndex,snapshot.index]);
  for(let i=0;i<lines.length;i++){
    if(selected.has(i)||!lines[i].trim()||lines[i].trimStart().startsWith('#'))continue;
    // Other subgraphs may not depend on the selected local suite reference:
    // rewriting them would change relationships rather than just its coordinates.
    if(lines[i].includes(version.value)||lines[i].includes(ref)||/^\s+(?:['"])?dsh-system-enhancement-package(?:['"])?\s*:/.test(lines[i]))reject('Additional suite relationships require separate dependency review.');
  }
  const nextRef=local(`file:${artifact.path.replaceAll('\\','/')}`),nextKey=SUITE+'@'+nextRef;
  profile.dependencies[SUITE]=nextRef;
  lines[specifier.index]=`        specifier: ${quote(nextRef)}`;lines[version.index]=`        version: ${quote(nextRef)}`;
  lines[pkg.index]=`  ${quote(nextKey)}:`;lines[snapshot.index]=`  ${quote(nextKey)}:${/:\s*\{\}\s*$/.test(lines[snapshot.index])?' {}':''}`;
  lines[packageVersion.index]=`    version: ${artifact.manifest.version}`;
  lines[resolutionIndex]=`    resolution: {integrity: ${artifact.integrity}, tarball: ${quote(nextRef)}}`;
  return {manifestBytes:Buffer.from(`${JSON.stringify(profile,null,2)}\n`),lockBytes:Buffer.from(lines.join(newline))};
}
