// Transport metadata is pinned separately from application/install authority.
const fail=()=>{throw Object.assign(Error('SEP_NATIVE_INSTALLER_TRANSPORT'),{code:'SEP_NATIVE_INSTALLER_TRANSPORT'});};
const check=b=>{if(!b)fail();},digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),positive=(n,max=2147483648)=>Number.isSafeInteger(n)&&n>0&&n<=max;
const relative=p=>typeof p==='string'&&p.length>0&&p.length<2048&&!/[\\:\x00-\x20\x7f]/.test(p)&&!p.startsWith('/')&&p.split('/').every(v=>v&&v!=='.'&&v!=='..');
export function validateTransportPins(all,stage,source){
 check(['payload','installer'].includes(stage)&&all?.schema===1&&all.repository==='Lance-QwQ/DSH-SEP');const p=all[stage];check(p?.status==='ready'&&p.sourceCommit===source.commit&&positive(p.runId,1e15)&&Array.isArray(p.artifacts)&&p.artifacts.length>0&&p.artifacts.length<=16);
 const ids=new Set(),members=new Map();let expanded=0,downloadBytes=0;
 for(const r of p.artifacts){check(positive(r.id,1e15)&&!ids.has(r.id)&&typeof r.name==='string'&&/^[A-Za-z0-9._-]{1,128}$/.test(r.name)&&positive(r.bytes)&&digest(r.sha256)&&Array.isArray(r.members)&&r.members.length>0&&r.members.length<=100000);ids.add(r.id);downloadBytes+=r.bytes;check(downloadBytes<=4294967296);const names=new Set();for(const m of r.members){check(relative(m.path)&&!names.has(m.path)&&Number.isSafeInteger(m.bytes)&&m.bytes>=0&&m.bytes<=2147483648&&digest(m.sha256));names.add(m.path);expanded+=m.bytes;check(expanded<=4294967296);members.set(r.id+':'+m.path,m);}}
 const wanted=new Map([['RESULT.json',{bytes:source.assemblyBytes,sha256:source.assemblySha256}],['PACKAGE-INVENTORY.json',{bytes:source.inventoryBytes,sha256:source.inventorySha256}],...(source.verification??[]).map(r=>[r.name,r])]);
 check(Array.isArray(p.outputs)&&p.outputs.length===wanted.size&&new Set(p.outputs.map(r=>r.name)).size===wanted.size);
 for(const r of p.outputs){const expected=wanted.get(r.name),m=members.get(r.artifactId+':'+r.member);check(expected&&m&&m.bytes===expected.bytes&&m.sha256===expected.sha256);}
 check(Array.isArray(p.parts)&&p.parts.length>0&&p.parts.length<=16);let bytes=0;for(const[i,r]of p.parts.entries()){const m=members.get(r.artifactId+':'+r.member);check(r.index===i+1&&positive(r.bytes)&&digest(r.sha256)&&m&&m.bytes===r.bytes&&m.sha256===r.sha256);bytes+=r.bytes;}check(bytes===source.archiveBytes);return p;
}
export function validateArtifactMetadata(r,p,transport){check(r?.id===p.id&&r.name===p.name&&r.size_in_bytes===p.bytes&&r.digest==='sha256:'+p.sha256&&r.expired===false&&r.workflow_run?.id===transport.runId&&r.workflow_run?.head_sha===transport.sourceCommit);return r;}
export function validateDownloadUrl(value){let u;try{u=new URL(value);}catch{fail();}check(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname.endsWith('.blob.core.windows.net')||u.hostname.endsWith('.actions.githubusercontent.com')));return u;}
