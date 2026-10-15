import assert from 'node:assert/strict';

export function verifyMemoryProject(memory,authority,project){
 assert.equal(memory.available,true);
 assert.equal(memory.projects.length,1);
 // The native settings API exposes Scope.project.key. Managed Scope obtains
 // that key from recovery authority.memoryKey, not from recovery's UUID.
 // Do not infer identity from a hash-shaped string or recompute from a path:
 // recovery may preserve memoryKey across a governed project relocation.
 assert.equal(authority.id,project.id);
 assert.equal(authority.root,project.root);
 assert.equal(typeof authority.memoryKey,'string');
 assert(authority.memoryKey.length>0);
 assert.equal(memory.projects[0].root,authority.root);
 assert.equal(memory.projects[0].id,authority.memoryKey);
 return memory.projects[0].id;
}
