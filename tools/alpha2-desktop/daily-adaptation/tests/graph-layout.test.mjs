import {test} from 'node:test';import assert from 'node:assert/strict';
import {packagePath,packageOwner,assertGraphLayout} from '../lib/graph-layout.mjs';
test('materialized package ownership selects the exact nested package',()=>{
 const graph={schema:3,kind:'dsh-sep-materialized-graph',packages:[{id:'a'},{id:'b'}],roots:{alpha:'a'},packagePaths:{a:'node_modules/alpha',b:'node_modules/alpha/node_modules/beta'}};
 assertGraphLayout(graph);assert.deepEqual(packageOwner(graph,'node_modules/alpha/node_modules/beta/lib/index.js'),{id:'b',path:'lib/index.js'});
 assert.deepEqual(packageOwner(graph,'node_modules/alpha/lib/index.js'),{id:'a',path:'lib/index.js'});
 assert.equal(packageOwner(graph,'node_modules/alpha-other/index.js'),null);
 for(const path of ['../outside','node_modules/../outside','node_modules/a\\b','node_modules/C:/a','node_modules//a'])assert.throws(()=>packagePath({...graph,packagePaths:{...graph.packagePaths,a:path}},'a'));
 assert.throws(()=>assertGraphLayout({...graph,packagePaths:{a:'node_modules/alpha',b:'node_modules/alpha'}}));
 assert.throws(()=>assertGraphLayout({...graph,roots:{foreign:'a'}}));
 assert.equal(packagePath({schema:2},'p0001'),'store/p0001');
});
