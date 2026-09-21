const fail=code=>{throw Object.assign(new Error(code),{code});};

/** Project-relative logical identity. Filesystem identity is checked separately
 * by the source reviewer; a spelling change cannot override this exclusion. */
export function normalizeDocumentPath(value){
  if(typeof value!=='string'||!value||value.length>4096||/[\0-\x1f:]/.test(value))fail('P2_DOCUMENT_PATH_INVALID');
  const path=value.replaceAll('\\','/');
  if(path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)))fail('P2_DOCUMENT_PATH_INVALID');
  return process.platform==='win32'?path.toLowerCase():path;
}
export function documentMatches(marker,owner,path){
  return typeof marker?.documentPath==='string'&&marker.owner===owner&&normalizeDocumentPath(path)===marker.documentPath;
}
export function validateDocumentMarker(marker){
  if(marker?.documentPath===undefined)return;
  if(marker.status!=='purged'||typeof marker.owner!=='string'||!/^project:.+/.test(marker.owner)||marker.documentPath!==normalizeDocumentPath(marker.documentPath)||! /^[a-f0-9]{64}$/.test(marker.planHash??'')||marker.keyHash!==undefined||marker.textHash!==undefined)fail('P2_DELETION_INVALID');
  if(marker.sourceIdentity!==undefined){const identity=marker.sourceIdentity;if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).length!==2||!['volumeSerialNumber','fileId'].every(key=>typeof identity[key]==='string'&&/^\d{1,40}$/.test(identity[key]))||/^0+$/.test(identity.fileId))fail('P2_DELETION_INVALID');}
}
export function assertDocumentDeletionProtocol(checkpoint,...artifacts){
  if((checkpoint.documentDeletionProtocol===1||checkpoint.deletions?.some(entry=>entry.documentPath!==undefined))&&artifacts.some(artifact=>artifact?.manifest?.dshSuiteDocumentDeletionProtocol!==1))fail('P2_DOCUMENT_DELETION_PROTOCOL_REQUIRED');
}
