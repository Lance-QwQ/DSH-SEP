export const zh = {
 rediscoveryRequired:'需要重新检查官方更新；历史评估和用量记录会保留',
 noCandidate:'缺少目标候选依赖清单与隔离验证，无法判断兼容',staticIncompatible:'静态依赖约束不满足或绑定验证未通过；具体条目保留在现有全插件兼容性报告',boundEvidence:'已有与候选绑定的证据；本次模型评估没有新增运行验证',
 unreported:'尚未报告',accountingUnavailable:'暂时无法读取预算用量；不代表没有消费',
 title:'官方 DSH 更新适配评估',enabled:'发现官方新版本时自动评估并复核',
 costHelp:'版本查询本身不消耗模型 token。启用后，后台适配分析和独立复核都会消耗输入／输出 token，并可能产生费用；消耗取决于更新规模及插件数量，受现有共享预算护栏约束。复核会产生额外消耗，不承诺固定费用。',
 stopHelp:'关闭后不再发起新的模型请求；已启动调用有界收尾并如实结算。已有消费和预留不会清空，预算不会提高。',
 refresh:'刷新状态',retry:'手动重试评估及复核',target:'最近目标版本',analysis:'适配分析',review:'证据复核',result:'结果详情',none:'尚未发现待评估的新版本',
 notInstallable:'评估通过不代表全面兼容、已生成适配包或可以安装。安装仍须通过现有候选、指纹确认、停写、备份和风险审阅门禁。',
 usage:'实际已报告用量',input:'输入 token',output:'输出 token',estimate:'估算费用（元）',reserved:'未结算预留（元）',notInvoice:'费用为本地估算，不是供应商账单。结果未知的调用保留预留；未报告用量不按零消耗推断。',
 unavailable:'评估服务不可用，请检查 SEP 与预算服务',error:'操作结果未确认，请刷新读取已保存状态',
 pass:'通过',fail:'失败',blocked:'阻断',not_run:'未运行',running:'执行中',complete:'已结束',detected:'已发现',interrupted:'已中断',
 unknown:'未知／未运行验证',incompatible:'确认不兼容',compatible:'已有绑定验证证据',runtime:'本次未执行插件运行验证',model:'模型判断（不是运行验证）',
};
export type AssessmentLocaleKey=keyof typeof zh;
export const en: Record<AssessmentLocaleKey,string> = {
 rediscoveryRequired:'Check official updates again to continue assessment. Existing results and usage are retained.',
 noCandidate:'No target candidate dependency inventory or isolated verification is available',staticIncompatible:'Static dependency constraints or bound verification failed; the existing full plugin compatibility report retains the detailed evidence',boundEvidence:'Candidate-bound evidence already exists; this model assessment adds no runtime verification',
 unreported:'Not reported',accountingUnavailable:'Budget usage is currently unavailable; this does not mean no spending occurred',
 title:'Official DSH upgrade assessment',enabled:'Automatically assess and review newly discovered official versions',
 costHelp:'Version queries use no model tokens. Background adaptation analysis and independent review both consume input/output tokens and may incur charges. Usage depends on update size and plugin count and remains subject to existing shared budget guards. Review adds usage; no fixed cost is promised.',
 stopHelp:'Turning this off prevents new model requests. Started calls finish within bounds and remain accounted for. Spending and reservations are retained; budgets are never raised.',
 refresh:'Refresh status',retry:'Manually retry analysis and review',target:'Latest target version',analysis:'Adaptation analysis',review:'Evidence review',result:'Result details',none:'No new version detected for assessment',
 notInstallable:'Passing assessment does not mean full compatibility, a generated adaptation package, or installation permission. Existing candidate, fingerprint, write-stop, backup and risk-review requirements still apply.',
 usage:'Actual reported usage',input:'Input tokens',output:'Output tokens',estimate:'Estimated cost (CNY)',reserved:'Unsettled reservations (CNY)',notInvoice:'Costs are local estimates, not provider invoices. Unknown outcomes retain reservations; missing usage is not treated as zero spending.',
 unavailable:'Assessment service unavailable; check SEP and its budget service',error:'The outcome is unconfirmed. Refresh to read saved state',
 pass:'Pass',fail:'Fail',blocked:'Blocked',not_run:'Not run',running:'Running',complete:'Finished',detected:'Detected',interrupted:'Interrupted',
 unknown:'Unknown / no runtime verification',incompatible:'Confirmed incompatible',compatible:'Bound verification evidence exists',runtime:'No plugin runtime verification performed in this assessment',model:'Model judgment (not runtime verification)',
};
