import {readFile} from 'node:fs/promises';
import {isAbsolute,extname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};

/**
 * @typedef {Object} ConfigFile
 * @property {string} id
 * @property {string} role Exactly one selected file must have role `config`.
 * @property {string} path Absolute destination of a standalone suite JSON config.
 * @property {string} [source] Absolute candidate source before staging.
 * @property {string} [stagedPath] Sealed candidate bytes, preferred once available.
 * @property {boolean} [exists]
 */

/** Bind native health to an explicit selected suite configuration before any
 * health-only projection (isolated budgets, locks or read-only storage).
 * This deliberately does not resolve DSH YAML, patches or implicit includes.
 * The controller separately fingerprints inputs and verifies published bytes.
 *
 * @param {{files:ConfigFile[], runtime:{suiteConfig?:Object,currentSuiteConfig?:Object}, phase:'candidate'|'current'}} input
 * @returns {Promise<{phase:string,fileId:string,targetPath:string,readPath:string,sha256:string,configurationSource:string,binding:string}>}
 */
export async function assertConfigBinding({files,runtime,phase}={}){
  const selected=Array.isArray(files)?files.filter(file=>file?.role==='config'):[];
  const configurationSource=phase==='candidate'?'suiteConfig':phase==='current'?'currentSuiteConfig':null;
  if(selected.length!==1||!configurationSource||!object(runtime?.[configurationSource])){
    fail('P2_CONFIG_BINDING_REQUIRED','One explicit suite JSON config and its exact native health configuration are required.');
  }
  const file=selected[0];
  if(typeof file.id!=='string'||!file.id||!isAbsolute(file.path??'')||phase==='candidate'&&file.exists===false){
    fail('P2_CONFIG_BINDING_REQUIRED','The selected suite configuration must exist at an explicit absolute path.');
  }
  if(extname(file.path).toLowerCase()!=='.json'){
    fail('P2_CONFIG_FORMAT_UNSUPPORTED','Only a standalone suite JSON configuration is supported; DSH YAML and implicit patch resolution are not validated.');
  }
  const readPath=phase==='candidate'?(file.stagedPath??file.source):file.path;
  if(!isAbsolute(readPath??''))fail('P2_CONFIG_BINDING_REQUIRED','An absolute selected configuration source is required.');
  let bytes;
  try{bytes=await readFile(readPath);}
  catch{fail('P2_CONFIG_BINDING_REQUIRED','The selected configuration bytes cannot be read.');}
  let config;
  try{config=JSON.parse(bytes.toString('utf8'));}
  catch{fail('P2_CONFIG_FORMAT_UNSUPPORTED','The selected configuration is not valid JSON.');}
  if(!object(config)||config.enabled!==true||!Array.isArray(config.projects)){
    fail('P2_CONFIG_FORMAT_UNSUPPORTED','The JSON must contain the enabled suite configuration itself, not a host envelope or a disabled suite.');
  }
  if(!isDeepStrictEqual(config,runtime[configurationSource])){
    fail('P2_CONFIG_MISMATCH','Native health configuration differs from the selected configuration; P2, scope, model and budget fields must match without projection.');
  }
  return {phase,fileId:file.id,targetPath:resolve(file.path),readPath:resolve(readPath),
    sha256:createHash('sha256').update(bytes).digest('hex'),configurationSource,binding:'explicit-suite-json-v1'};
}
