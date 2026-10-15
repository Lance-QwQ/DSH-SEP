import {z} from 'zod';
import {archiveReason} from '../layer-policy.js';

export const adoptionCategory=z.enum(['preference','personal','goal','task','project','temporary']);
export const adoptionRecordSchema=z.object({id:z.string().min(1).max(256),owner:z.string(),scope:z.enum(['project','user']),layer:z.enum(['L2','L3']),category:adoptionCategory,
  text:z.string().max(2000),status:z.enum(['candidate','confirmed']),revision:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),lastUsedAt:z.string().optional(),
  source:z.json(),automatic:z.json().optional(),semanticKey:z.string(),pinned:z.boolean(),dependsOn:z.array(z.string()),dueAt:z.string().optional(),
  taskState:z.enum(['active','open','completed','cancelled']),closedAt:z.string().optional(),historyRefs:z.array(z.string()),conflictsWith:z.array(z.string()).optional()}).strict();

export function adoptionTimestamp(value){
  if(typeof value!=='string')return NaN;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m)return NaN;const [,year,month,date,hour,minute,second,zone]=m;
  const y=+year,mo=+month,d=+date,leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(mo<1||mo>12||d<1||d>days[mo-1]||+hour>23||+minute>59||+second>59)return NaN;
  if(zone!=='Z'&&(+zone.slice(1,3)>23||+zone.slice(4)>59))return NaN;
  return Date.parse(value);
}

/** Only classifies the original clocks. No import or query timestamp is written. */
export function adoptionLifecycle(record,{evaluatedAt,active}){
  const clock=adoptionTimestamp(evaluatedAt),issues=[],times={};
  if(!Number.isFinite(clock))throw Object.assign(new Error('P2_ADOPTION_TIME'),{code:'P2_ADOPTION_TIME'});
  for(const field of ['createdAt','updatedAt','lastUsedAt','closedAt']){
    if(record[field]===undefined&&!['createdAt','updatedAt'].includes(field))continue;
    times[field]=adoptionTimestamp(record[field]);if(!Number.isFinite(times[field])||times[field]>clock)issues.push(field);
  }
  if(times.updatedAt<times.createdAt)issues.push('updatedAt_before_createdAt');
  if(times.closedAt<times.createdAt)issues.push('closedAt_before_createdAt');
  if(['task','goal'].includes(record.category)&&['completed','cancelled'].includes(record.taskState)&&record.closedAt===undefined)issues.push('closedAt_missing');
  if(record.dueAt!==undefined&&!Number.isFinite(adoptionTimestamp(record.dueAt)))issues.push('dueAt');
  if(record.automatic?.expiresAt!==undefined&&!Number.isFinite(adoptionTimestamp(record.automatic.expiresAt)))issues.push('automatic.expiresAt');
  if(issues.length)return {disposition:'excluded',reasons:['unknown_time'],timeIssues:issues,nativeArchiveReason:null};
  const nativeArchiveReason=archiveReason(record,{now:evaluatedAt,active});
  if(record.automatic?.expiresAt!==undefined&&adoptionTimestamp(record.automatic.expiresAt)<=clock){
    return {disposition:'expired',reasons:['existing_expiry_requires_review'],timeIssues:[],nativeArchiveReason};
  }
  return {disposition:nativeArchiveReason?'archive_due':'eligible',reasons:nativeArchiveReason?[nativeArchiveReason]:[],timeIssues:[],nativeArchiveReason};
}
