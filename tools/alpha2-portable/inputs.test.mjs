import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const {portableLock}=await import('./inputs.mjs').catch(()=>({}));
const old='dsh-sep-bundle-0.2.1-beta.3-alpha2-adapter.1.tgz';
const fixture=`lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      dsh-sep-bundle:\n        specifier: file:D:/old/artifacts/r2/${old}\n        version: file:../artifacts/r2/${old}(peer-hash)\npackages:\n  dsh-sep-bundle@file:../artifacts/r2/${old}:\n    resolution: {integrity: sha512-OLD, tarball: file:../artifacts/r2/${old}}\nsnapshots:\n  dsh-sep-bundle@file:../artifacts/r2/${old}(peer-hash): {}\n`;
test('portable lock binds the new package without changing any peer or version key',()=>{
 assert.equal(typeof portableLock,'function');
 const bytes=Buffer.from('fixed current candidate');
 const actual=portableLock(fixture,bytes);
 const expected=fixture.replaceAll('file:D:/old/artifacts/r2/'+old,'file:../candidate.tgz').replaceAll('file:../artifacts/r2/'+old,'file:../candidate.tgz').replace('sha512-OLD','sha512-'+createHash('sha512').update(bytes).digest('base64'));
 assert.equal(actual,expected);
});
test('ambiguous tarball integrity refuses rather than weakening frozen installation',()=>{
 assert.equal(typeof portableLock,'function');
 assert.throws(()=>portableLock(fixture+`\n    resolution: {integrity: sha512-OTHER, tarball: file:../artifacts/r2/${old}}\n`,Buffer.from('candidate')),/PORTABLE_LOCK_BINDING/);
});
test('unknown candidate input refuses instead of producing a guessed lock',()=>{
 assert.equal(typeof portableLock,'function');
 assert.throws(()=>portableLock(fixture.replaceAll(old,'unrelated.tgz'),Buffer.from('candidate')),/PORTABLE_LOCK_BINDING/);
});
