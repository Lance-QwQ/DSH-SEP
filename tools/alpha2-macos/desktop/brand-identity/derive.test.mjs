import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {deriveBrandIdentity} from './derive.mjs';

const inputRoot=process.env.SEP_MAC_BRAND_INPUTS;
assert.ok(inputRoot,'SEP_MAC_BRAND_INPUTS must identify the fixed native source extraction');
const client=await readFile(join(inputRoot,'client.js'));
const manifest=await readFile(join(inputRoot,'package.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const local=value=>JSON.parse(JSON.stringify(value));
function render(bytes){
 let definition;
 const calls=[], FishLogo=function FishLogo(){},BrandWordmark=function BrandWordmark(){};
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(bytes.toString('utf8'),{window:{__ModuleLoader__:{load(value){definition=value;}}}},{timeout:1000});
 const api=definition.factory(id=>{
  calls.push(id);
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(id==='@deepseek-ai/dsh-client-ui-primitives')return {FishLogo,BrandWordmark};
  throw Error('Unexpected dependency '+id);
 });
 const components=new Map(),slots={inject(name,fn){const value=fn();if(value?.next)for(const _ of value){}},register({name},fn){components.set(name,fn);}};
 api.apply({slots});
 return {id:definition.id,inject:local(api.inject),calls,components,FishLogo,BrandWordmark,name:components.get('sidebar.brand.name')()};
}

test('adds a separate SEP badge while preserving the actual official wordmark component and props',()=>{
 const baseline=render(client),derived=render(deriveBrandIdentity({client,manifest}).client);
 assert.equal(baseline.name.type,baseline.BrandWordmark);
 assert.equal(derived.name.type,'span');
 const [wordmark,badge]=derived.name.props.children;
 assert.equal(wordmark.type,derived.BrandWordmark);
 assert.deepEqual(local(wordmark.props),{includeMark:false});
 assert.equal(badge.type,'svg');
 assert.equal(badge.props['data-dsh-sep-badge'],'true');
 assert.equal(badge.props.children[1].props.children,'SEP');
});

test('badge requests fixed 32 by 14 CSS pixels, official radius and theme colors without flex shrink',()=>{
 const {name}=render(deriveBrandIdentity({client,manifest}).client);
 assert.equal(name.type,'span');
 const badge=name.props.children[1],rect=badge.props.children[0];
 assert.deepEqual(local(name.props.style),{display:'inline-flex',alignItems:'center',gap:'6px'});
 assert.equal(badge.props.width,32);assert.equal(badge.props.height,14);
 assert.equal(badge.props.viewBox,'0 0 32 14');assert.equal(badge.props['aria-hidden'],true);
 assert.deepEqual(local(badge.props.style),{width:'32px',height:'14px',minWidth:'32px',maxWidth:'32px',flexShrink:0,display:'block'});
 assert.deepEqual(local(rect.props),{width:32,height:14,rx:2,fill:'currentColor'});
 assert.equal(badge.props.children[1].props.fill,'var(--dsw-alias-label-primary-inverted)');
});

test('official mark, two slot registrations, loader id and dependency set remain unchanged',()=>{
 const before=render(client),after=render(deriveBrandIdentity({client,manifest}).client);
 assert.equal(after.id,before.id);assert.deepEqual(after.calls,before.calls);assert.deepEqual(after.inject,before.inject);
 assert.deepEqual([...after.components.keys()],[...before.components.keys()]);
 const mark=after.components.get('sidebar.brand.mark')({size:19});
 assert.equal(mark.type,after.FishLogo);assert.deepEqual(local(mark.props),{size:19});
});

test('changed native client bytes and manifest fail before derivation',()=>{
 assert.throws(()=>deriveBrandIdentity({client:Buffer.concat([client,Buffer.from('\n')]),manifest}),{code:'SEP_MAC_BRAND_SOURCE_CHANGED'});
 assert.throws(()=>deriveBrandIdentity({client,manifest:Buffer.concat([manifest,Buffer.from('\n')])}),{code:'SEP_MAC_BRAND_MANIFEST_CHANGED'});
});

test('derived input cannot be silently applied a second time',()=>{
 const derived=deriveBrandIdentity({client,manifest});
 assert.throws(()=>deriveBrandIdentity({client:derived.client,manifest}),{code:'SEP_MAC_BRAND_SOURCE_CHANGED'});
});

test('origin replays every declared single replacement to exactly the output, removing the obsolete source map only explicitly',()=>{
 const derived=deriveBrandIdentity({client,manifest});
 assert.equal(derived.origin.sourceSha256,hash(client));
 assert.equal(derived.origin.manifestSha256,hash(manifest));
 assert.equal(derived.origin.resultSha256,hash(derived.client));
 assert.equal(derived.origin.transformations.length,2);
 let replay=client.toString('utf8');
 for(const row of derived.origin.transformations){
  assert.equal(replay.split(row.from).length-1,1);assert.equal(row.count,1);
  replay=replay.replace(row.from,row.to);
 }
 assert.equal(replay,derived.client.toString('utf8'));
 assert.ok(!replay.includes('sourceMappingURL='));
 assert.equal(derived.origin.scope,'sidebar branding only; no desktop or runtime behavior change');
});
