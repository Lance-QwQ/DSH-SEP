/** Ask for the exact offline plan after presenting its complete report. */
export async function requestPlanConsent({expected,report,dialog,window}){
 if(report.hardBlocks.length)throw Error('SEP_PLAN_BLOCKED');
 const risks=report.plugins.filter(p=>p.verdict!=='compatible'),names=risks.map(p=>p.name);
 const options={title:'DSH SEP 更新审阅',type:risks.length?'warning':'question',message:'SEP 更新已准备，是否应用本次计划？',detail:'计划：'+expected.planHash+'\n\n'+(risks.length?`${risks.length} 个插件/组件不兼容或未逐项验证。完整清单已在报告窗口展示。\n`+names.slice(0,12).join('\n')+(names.length>12?'\n其余见完整报告。':''):'关键检查通过，完整报告已展示。')+'\n\n只替换报告中列出的 SEP 自有组件；保留 DSH 版本、其他插件和私人数据。确认后仍会重新核验计划。',buttons:[risks.length?'接受本报告中的兼容性风险并更新':'确认本次更新','取消更新'],defaultId:1,cancelId:1};
 const answer=await (window?dialog.showMessageBox(window,options):dialog.showMessageBox(options));return {schema:1,...expected,accepted:answer.response===0,at:new Date().toISOString()};
}
export function reviewArguments(args){const get=prefix=>{const found=args.filter(v=>v.startsWith(prefix));if(found.length!==1)throw Error('SEP_REVIEW_ARGUMENT');return found[0].slice(prefix.length);};const directory=get('--sep-updates-directory='),id=get('--sep-preparation-id=');if(!directory||!/^[a-f0-9-]{36}$/.test(id))throw Error('SEP_REVIEW_ARGUMENT');return {directory,id};}
