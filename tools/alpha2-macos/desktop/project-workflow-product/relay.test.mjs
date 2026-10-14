import test from 'node:test';import assert from 'node:assert/strict';import {PassThrough,Duplex} from 'node:stream';
const mod=await import('./relay.mjs').catch(()=>({}));
const binding={nonce:'a'.repeat(64),programSha256:'b'.repeat(64),ownerGeneration:'generation-1'};
function pair(){const a=new PassThrough(),b=new PassThrough(),ports=[Duplex.from({readable:a,writable:b}),Duplex.from({readable:b,writable:a})];for(const port of ports)port.on('error',()=>{});return ports;}
const tick=()=>new Promise(setImmediate);
test('relay sends binding only on owned desktop pipe and relays both frame directions',async()=>{
 assert.equal(typeof mod.openProjectRelay,'function');const [host,hostPeer]=pair(),[desktop,desktopPeer]=pair();let toDesktop='',toHost='';desktopPeer.on('data',b=>toDesktop+=b);hostPeer.on('data',b=>toHost+=b);
 const relay=mod.openProjectRelay({hostPort:host,desktopPort:desktop,binding});await tick();assert.deepEqual(JSON.parse(toDesktop.trim()),{schema:1,type:'initialize',...binding});toDesktop='';desktopPeer.write('{"request":1}\n');hostPeer.write('{"response":1}\n');await tick();assert.equal(toHost,'{"request":1}\n');assert.equal(toDesktop,'{"response":1}\n');relay.closeAdmission();assert.equal(relay.status().admissionOpen,false);assert.equal('resourcesConfirmedReleased' in relay.status(),false);for(const p of [host,hostPeer,desktop,desktopPeer])p.destroy();
});
test('oversized unfinished frame poisons relay before any partial forwarding',async()=>{
 assert.equal(typeof mod.openProjectRelay,'function');const [host,peer]=pair(),[desktop,other]=pair();let writes=0,failures=0;peer.on('data',()=>writes++);other.resume();const relay=mod.openProjectRelay({hostPort:host,desktopPort:desktop,binding,onFailure:()=>failures++});other.write('x'.repeat(4097));await tick();assert.equal(writes,0);assert.equal(relay.status().admissionOpen,false);assert.equal(failures,1);for(const p of [host,peer,desktop,other])p.destroy();
});
test('unexpected EOF rejects further admission and never proves cleanup',async()=>{
 assert.equal(typeof mod.openProjectRelay,'function');const [host,peer]=pair(),[desktop,other]=pair();other.resume();const relay=mod.openProjectRelay({hostPort:host,desktopPort:desktop,binding});peer.end();await tick();assert.equal(relay.status().admissionOpen,false);assert.equal(relay.status().code,'SEP_PROJECT_UI_CHANNEL');assert.equal('resourcesConfirmedReleased' in relay.status(),false);for(const p of [host,peer,desktop,other])p.destroy();
});
