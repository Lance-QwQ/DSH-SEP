import{readdir,lstat,realpath,readlink,readFile}from'node:fs/promises';import{resolve,relative,join,isAbsolute}from'node:path';import{createHash}from'node:crypto';
const inside=(a,b)=>{const r=relative(a,b);return r!== '..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r)};
export async function auditDesktopPayload(root){root=resolve(root);if(await realpath(root)!==root)throw Error('PAYLOAD_ROOT_ALIAS');const files=[],links=[];async function walk(at){for(const name of (await readdir(at)).sort()){const p=join(at,name),s=await lstat(p),path=relative(root,p).split('\\').join('/');if(s.isSymbolicLink()){const target=await readlink(p);if(isAbsolute(target))throw Error('PAYLOAD_LINK_ABSOLUTE');let canonical;try{canonical=await realpath(p)}catch{throw Error('PAYLOAD_LINK_UNRESOLVED')}if(!inside(root,canonical))throw Error('PAYLOAD_LINK_ESCAPE');links.push({path,target,resolved:relative(root,canonical).split('\\').join('/')});}else if(s.isDirectory())await walk(p);else if(s.isFile()){if(s.nlink!==1)throw Error('PAYLOAD_HARDLINK');const b=await readFile(p);files.push({path,size:b.length,mode:process.platform==='win32'?0o644:s.mode&0o777,sha256:createHash('sha256').update(b).digest('hex')});}else throw Error('PAYLOAD_FILE_TYPE')}}await walk(root);return{files,links};}

const fail=code=>{throw Error(code)},safe=p=>typeof p==='string'&&p.length>0&&!p.includes('\\')&&!p.startsWith('/')&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/[\x00-\x1f:]/.test(s));
export function validateDesktopPayload(m){
 if(m?.schema!==1||m.platform!==process.platform+'-'+process.arch||!['linux','darwin','win32'].includes(process.platform)||typeof m.version!=='string'||!Array.isArray(m.files)||!Array.isArray(m.links)||!safe(m.executable))fail('DESKTOP_PAYLOAD_SCHEMA');
 const seen=new Set(),links=new Set(m.links.map(l=>l.path));
 for(const f of [...m.files,...m.links]){if(!safe(f.path))fail('DESKTOP_PAYLOAD_PATH');if(seen.has(f.path))fail('DESKTOP_PAYLOAD_DUPLICATE');seen.add(f.path);for(let i=1;i<f.path.split('/').length;i++)if(links.has(f.path.split('/').slice(0,i).join('/')))fail('DESKTOP_PAYLOAD_LINK_PARENT');}
 for(const f of m.files)if(!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{64}$/.test(f.sha256)||![0o644,0o755,0o600,0o700].includes(f.mode))fail('DESKTOP_PAYLOAD_FILE');
 for(const l of m.links){if(typeof l.target!=='string'||!l.target||l.target.includes('\\')||isAbsolute(l.target)||!safe(l.resolved)||!inside('/payload',resolve('/payload',l.path,'..',l.target)))fail('DESKTOP_PAYLOAD_LINK_ESCAPE');}
 if(!seen.has(m.executable))fail('DESKTOP_PAYLOAD_EXECUTABLE');return m;
}
export async function verifyDesktopPayload(root,m){
 validateDesktopPayload(m);const current=await auditDesktopPayload(root);
 const sorted=rows=>[...rows].sort((a,b)=>a.path.localeCompare(b.path));
 const key=rows=>JSON.stringify(sorted(rows).map(f=>Object.fromEntries(Object.entries(f).sort(([a],[b])=>a.localeCompare(b)))));
 if(key(current.files)!==key(m.files)||key(current.links)!==key(m.links))fail('DESKTOP_PAYLOAD_CHANGED');
 const executable=join(root,m.executable),s=await lstat(await realpath(executable));if(!s.isFile()||(process.platform!=='win32'&&!(s.mode&0o111)))fail('DESKTOP_PAYLOAD_EXECUTABLE');return executable;
}
export async function installedDesktopExecutable(config){
 const root=join(config.dailyRoot,'runtime/desktop'),path=join(config.dailyRoot,'managed/desktop-payload.json'),s=await lstat(path);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||await realpath(path)!==path||s.size>4194304)fail('DESKTOP_RECEIPT_IDENTITY');
 const b=await readFile(path);if(createHash('sha256').update(b).digest('hex')!==config.desktopPayloadSha256)fail('DESKTOP_RECEIPT_CHANGED');return verifyDesktopPayload(root,JSON.parse(b));
}
