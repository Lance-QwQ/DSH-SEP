import{readFile}from'node:fs/promises';import{isAbsolute}from'node:path';
export async function verifyBoundHealth(path,targetRoot,targetGraphHash){
 if(!isAbsolute(path??''))throw Error('SEP_PLAN_HEALTH_REQUIRED');const h=JSON.parse(await readFile(path));
 if(h.status!=='pass'||h.targetRoot!==targetRoot||h.targetGraphHash!==targetGraphHash||!Array.isArray(h.checks)||!['desktop-host','recovery-control','governed-storage'].every(name=>h.checks.some(c=>c.name===name&&c.status==='pass')))throw Error('SEP_PLAN_HEALTH');
 return{status:'pass',version:'0.2.0-rc.2',kind:'bound-empty-profile-runtime-health',graphHash:targetGraphHash};
}