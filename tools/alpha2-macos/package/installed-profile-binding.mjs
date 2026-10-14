// Test-only path contract. The installed product manifest is independently pinned.
import assert from 'node:assert/strict';
import {posix} from 'node:path';
import {createHash} from 'node:crypto';
import {validateProgramShape} from '../desktop/managed-broker/program-manifest.mjs';
export function verifyInstalledProfileBinding(profile,{programBytes,programSha256,app,dataRoot}){
 assert.equal(createHash('sha256').update(programBytes).digest('hex'),programSha256);
 const program=validateProgramShape(JSON.parse(programBytes));assert.equal(program.schema,4);
 const root=posix.join(app,'Contents');
 assert.equal(profile.programRoot,root);assert.equal(profile.hostRoot,posix.join(root,program.hostRoot));assert.equal(profile.bundleRoot,posix.join(root,program.bundleRoot));
 assert.equal(profile.helperPath,posix.join(root,program.entries.helper.path));
 assert.equal(profile.helperSha256,program.entries.helper.sha256);
 assert.equal(profile.dataRoot,posix.join(dataRoot,'business'));assert.equal(profile.source,posix.join(dataRoot,'project'));
 return {installedPathBound:true};
}
