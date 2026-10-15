// This explicit manifest fixes the unchanged production sources independently
// of the later payload/installer artifact pins. No directory discovery.
import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {fileBytes,hash} from './installer-binding.mjs';
export const SOURCE_MANIFEST_SHA256='379be1413b87ec063eeee3b3029a160ce4d76e150efefa63567f7b6740780d71';
export async function verifyInstallerSources(root){
 const bytes=await readFile(new URL('./installer-sources.json',import.meta.url));
 if(hash(bytes)!==SOURCE_MANIFEST_SHA256)throw Object.assign(Error('SEP_NATIVE_INSTALLER_SOURCE_MANIFEST'),{code:'SEP_NATIVE_INSTALLER_SOURCE_MANIFEST'});
 const manifest=JSON.parse(bytes),files=[];
 for(const row of manifest.files){const actual=await fileBytes(join(root,row.path),4194304);if(actual.length!==row.bytes||hash(actual)!==row.sha256)throw Object.assign(Error('SEP_NATIVE_INSTALLER_SOURCE_CHANGED'),{code:'SEP_NATIVE_INSTALLER_SOURCE_CHANGED'});files.push({...row});}
 return {manifestSha256:SOURCE_MANIFEST_SHA256,files};
}