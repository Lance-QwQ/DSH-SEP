window.__ModuleLoader__.load({id:'@dsh-sep/current-project-ui',factory:require=>{
 'use strict';
 const React=require('react'),h=React.createElement;
 const code=e=>/^(?:SEP|FS)_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_PROJECT_UI_UNAVAILABLE';
 const omitted={binary:'二进制内容', 'non-utf8':'非 UTF-8 文本','file-byte-limit':'单文件预览大小上限','total-byte-limit':'总预览大小上限','line-limit':'预览行数上限'};
 function CurrentProjectSection(){
  const api=window.sepCurrentProject;
  const [state,setState]=React.useState(null),[plans,setPlans]=React.useState([]),[history,setHistory]=React.useState({items:[],nextAfter:null}),[review,setReview]=React.useState(null),[busy,setBusy]=React.useState(true),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[presented,setPresented]=React.useState(false);
  const lifetime=React.useRef(0),reviewRef=React.useRef(null),working=React.useRef(false);reviewRef.current=review;
  async function refresh(epoch){
   const next=await api.call('status',{});if(lifetime.current!==epoch)return;setState(next);
   if(next.recoveryRequired){setPlans([]);setHistory({items:[],nextAfter:null});return;}
   const [p,g]=await Promise.all([api.call('plans',{}),api.call('generations',{after:0,limit:16})]);if(lifetime.current===epoch){setPlans(p);setHistory(g);}
  }
  React.useEffect(()=>{
   const epoch=++lifetime.current;setBusy(true);
   if(!api){setError('SEP_PROJECT_UI_UNAVAILABLE');setBusy(false);return()=>{lifetime.current++;};}
   void api.begin().then(()=>refresh(epoch)).catch(e=>{if(lifetime.current===epoch)setError(code(e));}).finally(()=>{if(lifetime.current===epoch)setBusy(false);});
   return()=>{lifetime.current++;const prior=reviewRef.current;if(prior)void api.call('cancel',{reviewId:prior.reviewId}).catch(()=>{});};
  },[api]);
  React.useLayoutEffect(()=>{
   setPresented(false);if(!review||!api)return;let live=true;
   void api.presented({reviewId:review.reviewId,reviewSha256:review.reviewSha256}).then(()=>{if(live)setPresented(true);},e=>{if(live)setError(code(e));});return()=>{live=false;};
  },[api,review]);
  async function run(work){if(working.current||busy||!api)return;working.current=true;const epoch=lifetime.current;setBusy(true);setError('');setNotice('');try{await work(epoch);}catch(e){if(lifetime.current===epoch){setError(code(e));setReview(null);setPresented(false);}}finally{working.current=false;if(lifetime.current===epoch)setBusy(false);}}
  const button=(text,action,disabled=false,key=text)=>h('button',{key,type:'button',disabled:busy||!api||disabled,onClick:()=>void run(action),style:{margin:'4px 8px 4px 0',padding:'6px 12px'}},text);
  const preview=planHash=>async epoch=>{setReview(null);setPresented(false);await api.call('select',{planHash});const value=await api.call('review',{planHash});if(lifetime.current===epoch)setReview(value);};
  const discard=planHash=>async epoch=>{setReview(null);setPresented(false);await api.call('discard',{planHash});await refresh(epoch);};
  const commit=async epoch=>{const current=reviewRef.current;if(!current||!presented)return;const result=await api.commit({reviewId:current.reviewId});if(lifetime.current!==epoch)return;if(result.status==='cancelled'){setNotice('已取消提交，工作副本仍保留。');return;}setReview(null);setPresented(false);setNotice('已提交到受控工作副本。原始来源未改写。');await refresh(epoch);};
  return h('section',{'data-sep-current-project':'panel',style:{padding:20,maxWidth:960}},
   h('h2',null,'当前项目 · 工作副本'),
   h('p',null,'修改先保留为候选。预览后，由本机确认窗口确认提交；恢复也会先创建候选。原始来源保持不变。'),
   h('p',{'aria-live':'polite'},busy?'正在处理…':state?.current?`当前版本 ${state.current.generation} · ${plans.length} 个候选`:'当前状态不可用'),
   error?h('p',{role:'alert'},'此操作尚未完成。请刷新状态后再试。 ',h('code',null,error)):null,
   notice?h('p',{role:'status'},notice):null,
   button('刷新',epoch=>refresh(epoch)),
   state?.recoveryRequired?button('恢复已知事务',async epoch=>{setReview(null);await api.call('recover',{});await refresh(epoch);}):null,
   h('h3',null,'候选修改'),plans.length?h('ul',null,plans.map(plan=>h('li',{key:plan.planHash},h('code',null,plan.planHash.slice(0,12)),` · ${plan.changes.length} 个文件${plan.expired?' · 已过期':''}`,button('选择并预览',preview(plan.planHash),plan.expired,'preview'),button('丢弃此候选',discard(plan.planHash),false,'discard')))):h('p',null,'没有待审阅的候选。'),
   review?h('article',{'data-sep-current-project':'review','data-review-id':review.reviewId,'data-review-sha256':review.reviewSha256},
    h('h3',null,'提交预览'),h('p',null,`基于版本 ${review.binding.baseGeneration} · ${review.changes.length} 个文件`),
    h('p',null,'计划 ',h('code',null,review.binding.planHash.slice(0,12))),
    review.coverage.omitted.length?h('div',{role:'note'},h('strong',null,'部分正文未展示。确认窗口会要求单独确认这些省略。'),h('ul',null,review.coverage.omitted.map(row=>h('li',{key:row.path},row.path,'：',omitted[row.reason]??row.reason)))):h('p',null,'文本预览完整。'),
    review.diff.map(file=>h('section',{key:file.path},h('h4',null,file.path),file.hunks.map((chunk,index)=>h('pre',{key:index,style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:400,overflow:'auto',padding:12,border:'1px solid currentColor'}},chunk.lines.map((line,n)=>h('span',{key:n,style:{display:'block'}},line.kind==='added'?'+ ':line.kind==='removed'?'- ':'  ',line.text)))))),
    button('确认提交…',commit,!presented,'commit'),button('取消预览',async()=>{await api.call('cancel',{reviewId:review.reviewId});setReview(null);setPresented(false);},false,'cancel')
   ):null,
   h('h3',null,'历史版本'),h('ul',null,history.items.map(row=>h('li',{key:row.generation},`版本 ${row.generation}${row.current?'（当前）':''}`,row.current?null:button('创建恢复候选',async epoch=>{setReview(null);setPresented(false);await api.call('restore',{generation:row.generation});await refresh(epoch);},false,String(row.generation))))),
   history.nextAfter!==null?button('下一页',async epoch=>{const next=await api.call('generations',{after:history.nextAfter,limit:16});if(lifetime.current===epoch)setHistory(next);}):null
  );
 }
 return {inject:['slots'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'sep-current-project',order:36,label:()=> '当前项目 · 工作副本'},CurrentProjectSection));}};
}});
