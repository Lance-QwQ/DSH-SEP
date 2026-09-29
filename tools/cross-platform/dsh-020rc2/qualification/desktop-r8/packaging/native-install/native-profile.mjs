/** Create-only native defaults. Never applied over an existing user profile. */
export function nativeProfile(input) {
 const t=structuredClone(input);t.config.p1.enabled=true;
 const previous=t.patch.find(r=>r.id==='workspace-controller');
 if(!previous)t.patch.push({id:'workspace-controller',config:{documentsDirectory:'@ROOT@/workspace'}});
 else previous.config={...previous.config,documentsDirectory:previous.config?.documentsDirectory??'@ROOT@/workspace'};
 const rows=t.patch.flatMap(r=>r.insert??[]),projects=t.config.projects.map(p=>({id:p.recoveryProjectId,root:p.root}));
 const add=[{id:'sep-plugin-group',name:'dsh-sep-plugin-group',config:{enabled:true,projects}},{id:'sep-brand',name:'dsh-sep-brand',config:{}}].filter(row=>!rows.some(r=>r.id===row.id));
 if(add.length)t.patch.push({insert:add});return t;
}
