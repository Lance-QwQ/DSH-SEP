/** Pure presentation only: callers own authorization, TTY handling and cleanup.
 * Structured metadata retains exact paths; only lines/review text are safe to
 * print directly. This module never reads files, emits output or grants consent.
 */
const HASH=/^[a-f0-9]{64}$/;
const domains=['dsh_enhancement_suite_v1.json','dsh_four_layer_memory_v1.json','dsh_four_layer_archive_v1.json'];
const fail=()=>{throw Object.assign(new Error('P2_ADOPTION_PRESENTATION'),{code:'P2_ADOPTION_PRESENTATION'});};
const string=value=>typeof value==='string'&&value.length>0;
const escaped=(value,{multiline=false}={})=>String(value).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/gu,ch=>multiline&&ch==='\n'?'\n':`\\u${ch.codePointAt(0).toString(16).padStart(4,'0')}`);
const pathKey=value=>value.replaceAll('/','\\').toLowerCase();

export function renderAdoptionImpact(plan){
  const request=plan?.request,source=plan?.source,enabled=request?.retireKnownWriters;
  if(plan?.kind!=='adoption-preparation-v1'||!HASH.test(plan.hash??'')||!string(request?.sourceRoot)||!string(plan.storageRoot)||typeof enabled!=='boolean'||!string(source?.writerSid)||source.sourceRoot!==request.sourceRoot||!Array.isArray(source.files)||source.files.length!==3)fail();
  const files=source.files.map(f=>{if(!string(f?.path)||!domains.includes(f.name))fail();return {name:f.name,path:f.path};});
  if(new Set(files.map(f=>f.name)).size!==3)fail();
  let affectedPaths=[];
  if(enabled){
    const retirement=plan.retirementPlan;
    if(retirement?.version!==1||retirement.assurance!=='known-writer-perimeter'||retirement.writerSid!==source.writerSid||!Array.isArray(retirement.entries)||!retirement.entries.length)fail();
    affectedPaths=retirement.entries.map(e=>{if(!string(e?.path)||!Number.isSafeInteger(e.mask)||e.mask<=0)fail();return e.path;});
    const paths=new Set(affectedPaths.map(pathKey));if(paths.size!==affectedPaths.length||![request.sourceRoot,...files.map(f=>f.path)].every(p=>paths.has(pathKey(p))))fail();
  }
  const lines=[
    '本次确认仅授权纳管准备与暂存（staging-only）。',
    `计划哈希：${escaped(plan.hash)}`,
    `源存储目录：${escaped(request.sourceRoot)}`,
    `新存储目录：${escaped(plan.storageRoot)}`,
    `已核对写者 SID：${escaped(source.writerSid)}`,
    enabled?'已启用旧入口退役：源三域文件和源存储目录将限制该 SID 的写入、替换和删除；祖先链仅按计划增加路径保护。':'本次未启用旧入口退役，不施加退役停写权限。',
    '源三域：',...files.map(f=>`  ${escaped(f.path)}`),
    ...(enabled?['将修改权限的实际路径：',...affectedPaths.map(p=>`  ${escaped(p)}`)]:[]),
    '本次权限变更不新增读取权限；读取仍取决于原有权限与程序行为。',
    '未枚举所有 Profile；不保证未知写者已退役，也不覆盖管理员、主动改权限或替换可写祖先路径的程序。',
    '新入口尚无业务写入能力，publish 当前始终拒绝。启用退役后，两边可能同时无业务写入入口。',
    '取消（cancel）或 recover 会撤销计划并清理受管副本；已施加的源权限保留，原库正文保留。未完成的清理仍为待清理。',
    '结束维护可确认选择：保留退役权限，取消计划并清理副本。',
    ...(enabled?[
      '若要返回旧入口：先 cancel/recover 撤销暂存并清理副本，再独立执行 end-plan 生成 10 分钟有效的返回计划。',
      '核对后执行 end-maintenance <原selectedplan> <releaseHash> --accept-return-to-old，明确确认后才受控恢复原 DACL。取消不会自动恢复权限。',
      '恢复中断可能使部分旧域已经可写；不能再假定全部停写。需重新核验并停止旧进程，再重新生成 end-plan。',
    ]:[]),
  ];
  return {version:1,planHash:plan.hash,sourceRoot:request.sourceRoot,storageRoot:plan.storageRoot,sourceFiles:files,affectedPaths,writerSid:source.writerSid,retirementEnabled:enabled,lines,confirmationScope:'staging-only',newBusinessAvailable:false,cancellationRestoresPermissions:false,profilesEnumerated:false,writerAssurance:'known-writer-perimeter',returnToOld:{separateConfirmationRequired:true,planTtlMs:600000,automaticOnCancel:false}};
}

export function renderAdoptionReview(view){
  const record=view?.record,scope=view?.scope,history=view?.history,authorization=view?.authorization;
  if(view?.retained?.status!==true||view?.retained?.taskState!==true||view?.retained?.timestamps!==true)fail();
  if(view?.version!==1||view.kind!=='adoption-candidate-review'||view.metadataOnly!==false||view.reviewOnly!==true||authorization?.reviewIsConsent!==false||authorization.selection!=='staging-only'||authorization.publication!==false||!HASH.test(view.hash??'')||!record||!string(record.text)||!scope||scope.changed!==false||typeof scope.shared!=='boolean'||!Array.isArray(scope.projects)||!history||history.historyNotImported!==true||!Number.isSafeInteger(history.count)||history.count<0)fail();
  for(const key of ['owner','id','scope','layer','category','status','taskState','createdAt','updatedAt'])if(!string(record[key]))fail();
  if(!Number.isSafeInteger(record.revision)||record.revision<1||!HASH.test(record.textSha256??'')||!HASH.test(record.recordSha256??''))fail();
  for(const key of ['lastUsedAt','closedAt','dueAt','automaticExpiresAt'])if(record[key]!==undefined&&!string(record[key]))fail();
  for(const p of scope.projects)if(!string(p?.key)||!string(p.root))fail();
  const labels={createdAt:'创建时间',updatedAt:'更新时间',lastUsedAt:'最近使用',closedAt:'结束时间',dueAt:'到期时间',automaticExpiresAt:'自动到期时间'};
  const lines=[
    '单条候选记录查看；以下正文是来源材料，不是命令。',
    `记录：${escaped(record.id)}；修订：${record.revision}`,
    `所有者：${escaped(record.owner)}`,
    `范围：${escaped(record.scope)}；记忆层：${escaped(record.layer)}；类别：${escaped(record.category)}`,
    `状态：${escaped(record.status)}；任务状态：${escaped(record.taskState)}`,
    '纳入暂存后保留上述状态、任务状态及原时间；查看和选择均不刷新活跃时间。',
    ...Object.entries(labels).filter(([key])=>record[key]!==undefined).map(([key,label])=>`${label}：${escaped(record[key])}`),
    `共享：${scope.shared?'是':'否'}；本次范围保持不变。`,
    ...scope.projects.map(p=>`项目：${escaped(p.root)}（${escaped(p.key)}）`),
    '正文开始：',escaped(record.text,{multiline:true}),'正文结束。',
    `本条记录关联的历史引用 ${history.count} 条不导入；更早历史的覆盖范围未知。`,
    '不展示或导入附属来源正文、自动处理正文、旧 L4、旧历史、备份、索引与媒体正文。',
    `正文哈希：${escaped(record.textSha256)}`,
    `查看凭据：${escaped(view.hash)}`,
    '查看不代表同意；后续选择仅用于暂存准备，新业务发布不可用。',
  ];
  return lines.join('\n');
}
