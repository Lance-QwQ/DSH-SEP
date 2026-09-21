import {createHash} from 'node:crypto';
export const INTERVAL=10800000;
export const OFFICIAL='https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=100';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
function version(s){const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(rc|alpha|beta)\.(0|[1-9]\d*))?$/.exec(s??'');if(!m||s.length>80)return null;const n=[+m[1],+m[2],+m[3],m[4]?{alpha:0,beta:1,rc:2}[m[4]]:3,+(m[5]??0)];if(n.some(x=>!Number.isSafeInteger(x)))return null;return {s:s.replace(/^v/,''),n,channel:m[4]??'stable'};}
function compare(a,b){for(let i=0;i<a.n.length;i++)if(a.n[i]!==b.n[i])return a.n[i]-b.n[i];return 0;}
export function selectRelease(rows,current){
 const installed=version(current);if(!installed||!Array.isArray(rows)||rows.length>100)throw Error('UPDATE_METADATA_INVALID');let best=null;
 for(const r of rows){if(!r||typeof r!=='object'||typeof r.tag_name!=='string'||typeof r.draft!=='boolean'||typeof r.prerelease!=='boolean')throw Error('UPDATE_METADATA_INVALID');if(r.draft)continue;const v=version(r.tag_name.replace(/^dsh-/,''));if(!v)continue;
  // Follow the installed prerelease channel or a more stable one; never silently opt a stable/RC user into alpha.
  if(v.n[3]<installed.n[3])continue;
  const expected='https://github.com/deepseek-ai/deepseek-harness/releases/tag/'+r.tag_name;
  if(r.html_url!==expected||!Number.isFinite(Date.parse(r.published_at)))throw Error('UPDATE_RELEASE_ORIGIN');
  if(compare(v,installed)>0&&(!best||compare(v,best.v)>0))best={v,version:v.s,url:expected,publishedAt:r.published_at};
 }
 if(!best)return null;const {v,...result}=best;return result;
}
export async function fetchReleases({fetcher=fetch,signal}={}){
 const response=await fetcher(OFFICIAL,{method:'GET',redirect:'error',credentials:'omit',headers:{accept:'application/vnd.github+json','user-agent':'DSH-SEP-Update-Check','x-github-api-version':'2022-11-28'},signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])});
 if(!response.ok)throw Error('UPDATE_HTTP_'+response.status);const reader=response.body?.getReader();if(!reader)throw Error('UPDATE_EMPTY_RESPONSE');const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('UPDATE_RESPONSE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export class UpdateClock {
 constructor({check,now=Date.now}){this.check=check;this.now=now;this.last=null;this.operation=null;this.closed=false;}
 open(){if(this.closed)return Promise.resolve();if(this.operation)return this.operation;this.last=this.now();this.abort=new AbortController();this.operation=Promise.resolve().then(()=>this.check(this.abort.signal)).finally(()=>{this.operation=null;});return this.operation;}
 tick(){const now=this.now();return !this.closed&&(this.last===null||now-this.last>=INTERVAL||now<this.last)?this.open():Promise.resolve();}
 close(){this.closed=true;this.abort?.abort();}
}
export function compatibility(plugins,targetVersions,satisfies){return plugins.map(p=>{
 const reasons=[];for(const [name,range]of Object.entries(p.peerDependencies??{})){
  const actual=targetVersions[name];if(!actual){if(!p.peerDependenciesMeta?.[name]?.optional)reasons.push('缺少目标依赖：'+name);continue;}
  try{if(!satisfies(actual,range))reasons.push(name+' 要求 '+range+'，目标为 '+actual);}catch{reasons.push('无法解析依赖约束：'+name);}
 }
 return {name:p.name,instanceId:p.instanceId,version:p.version,source:p.source,enabled:p.enabled??'未确定',fingerprint:p.fingerprint,verdict:reasons.length?'incompatible':'unknown',reasons:reasons.length?reasons:['未提供与此候选绑定的隔离功能验证；静态约束通过不等于运行兼容']};
});}
export const riskHash=r=>hash({binding:r.binding,risks:r.plugins.filter(p=>p.verdict!=='compatible')});
export const acceptRisks=r=>({binding:r.binding,riskHash:riskHash(r),acceptedAt:new Date().toISOString()});
export function decide(r,consent){if(r.hardBlocks.length)return {allowed:false,decision:'blocked',reasons:r.hardBlocks};if(!r.plugins.some(p=>p.verdict!=='compatible'))return {allowed:true,decision:'normal'};if(consent?.binding===r.binding&&consent?.riskHash===riskHash(r))return {allowed:true,decision:'user-accepted-compatibility-risk'};return {allowed:false,decision:'confirmation-required'};}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderReport(r){const labels={compatible:'已验证兼容',incompatible:'已确认不兼容',unknown:'未验证'};return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>DSH SEP 更新检查报告</title><style>body{font:15px system-ui;padding:24px;color:#222;background:#fafafa}table{border-collapse:collapse;width:100%;table-layout:fixed}th:nth-child(1){width:30%}th:nth-child(2){width:15%}th:nth-child(3){width:12%}th:nth-child(3),td:nth-child(3){white-space:nowrap}td,th{padding:10px;border:1px solid #ddd;text-align:left;word-break:break-word}th{background:#eee}h1{font-size:23px}.blocked{color:#a21}p{white-space:pre-wrap}</style><h1>DSH SEP 更新兼容性报告</h1><p>本机 ${escape(r.current)} → 目标 ${escape(r.target)}\n检查时间：${escape(r.checkedAt)}\n${escape(r.scope??'已安装组件及插件；未知功能不执行') }</p><p class="blocked">${r.hardBlocks.map(escape).join('<br>')}</p><p>已确认不兼容：${r.plugins.filter(p=>p.verdict==='incompatible').length}；未验证：${r.plugins.filter(p=>p.verdict==='unknown').length}。接受风险不会覆盖或禁用插件，也不会将失败改为通过。</p><table><thead><tr><th>插件/组件 · 实例</th><th>版本 · 状态</th><th>兼容性</th><th>原因与范围</th></tr></thead><tbody>${[...r.plugins].sort((a,b)=>(a.verdict==='incompatible'?-1:1)-(b.verdict==='incompatible'?-1:1)).map(p=>`<tr><td>${escape(p.name)}<br>${escape(p.instanceId)}</td><td>${escape(p.version)}<br>${escape(p.enabled)}</td><td>${escape(labels[p.verdict]??'未验证')}</td><td>${(p.reasons??[]).map(escape).join('<br>')}</td></tr>`).join('')}</tbody></table>`;}

