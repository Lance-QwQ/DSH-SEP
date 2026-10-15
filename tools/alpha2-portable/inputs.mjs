import {createHash} from 'node:crypto';

/** Relocate only the fixed candidate reference. All resolved versions and peers
 * remain byte-identical; frozen installation still checks the new tarball. */
export function portableLock(input,bytes){
 const name='dsh-sep-bundle-0.2.1-beta.3-alpha2-adapter.1.tgz';
 const from='file:../artifacts/r2/'+name;
 const absolute=new RegExp('specifier: file:[A-Z]:/[^\\r\\n]+/'+name.replaceAll('.','\\.'),'g');
 const matches=[...input.matchAll(absolute)];
 if(matches.length!==1||input.split(from).length-1!==4)throw Error('PORTABLE_LOCK_BINDING');
 let output=input.replace(absolute,'specifier: file:../candidate.tgz').split(from).join('file:../candidate.tgz');
 let changed=0;
 output=output.replace(/resolution: \{integrity: [^,\n]+, tarball: file:\.\.\/candidate\.tgz\}/g,()=>{
  changed++;return 'resolution: {integrity: sha512-'+createHash('sha512').update(bytes).digest('base64')+', tarball: file:../candidate.tgz}';
 });
 if(changed!==1)throw Error('PORTABLE_LOCK_BINDING');
 return output;
}
