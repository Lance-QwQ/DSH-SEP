import {join} from 'node:path';
/** Prefer the version of the enclosing bundle. Captured child modules retain
 * independent historical versions and must not identify the whole product. */
export async function readInstalledSepVersion(projectDir,readJson){
 let bundle;
 try{bundle=await readJson(join(projectDir,'node_modules/dsh-sep-bundle/package.json'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 if(bundle!==undefined){
  if(bundle?.name!=='dsh-sep-bundle'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(bundle.version??''))throw Error('SEP_INSTALLED_MANIFEST_INVALID');
  return bundle.version;
 }
 const legacy=await readJson(join(projectDir,'node_modules/dsh-system-enhancement-package/package.json'));
 if(legacy.name!=='dsh-system-enhancement-package'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(legacy.version??''))throw Error('SEP_INSTALLED_MANIFEST_INVALID');
 return legacy.version;
}
