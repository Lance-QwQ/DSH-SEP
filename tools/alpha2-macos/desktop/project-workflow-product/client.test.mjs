import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('host client installs only a settings slot and never obtains a connection RPC authority',async()=>{
 const bytes=await readFile(new URL('./ui/lib/client.js',import.meta.url),'utf8');let module,slot;const imports=[];
 const react={createElement(){},useEffect(){},useLayoutEffect(){},useRef(){},useState(){}};
 vm.runInNewContext(bytes,{window:{__ModuleLoader__:{load(value){module=value.factory(name=>{imports.push(name);if(name!=='react')throw Error('unapproved dependency');return react;});}}}});
 assert.deepEqual(Array.from(module.inject),['slots']);module.apply({slots:{inject(name,fn){assert.equal(name,'settings.section');return fn();},register(config,component){slot={config,component};}}});assert.equal(slot.config.id,'sep-current-project');assert.equal(typeof slot.component,'function');assert.deepEqual(imports,['react']);
 const server=await import('./ui/lib/index.js');let routes=0;server.apply({connection:{addRoute(){routes++;}},provide(){routes++;}});assert.equal(routes,0);
});
