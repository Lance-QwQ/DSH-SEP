/** Product-owned Chinese and English copy; fixed keys keep both dictionaries complete. */
export const zh = {
  title: '记忆增强', master: '自动记忆增强', capture: '自动学习新信息', recall: '自动引用已有记忆', project: '项目', refresh: '刷新',
  scope: '项目级设置：影响所选项目的会话，可与标准、PTC、创造、极简模式组合。',
  masterHelp: '主开关开启两项，关闭暂停两项；也可分别调整，只开启需要的一项。',
  noDelete: '关闭不会删除已有记忆，不影响手动查询、编辑、删除与到期治理；已经进入当前对话的信息不会因此移除。',
  stored: '已保存', readAt: '上次确认', on: '开', off: '关', effective: '已生效', paused: '已暂停', capped: '受宿主配置限制', ineffective: '当前未生效',
  loading: '正在读取项目记忆设置…', saving: '等待当前记忆处理结束，保存后生效；请勿重复提交。',
  freshness: '显示上次读取的状态；其他会话可能更改设置，可点击刷新。变更从下一次记忆操作生效。',
  readError: '无法读取记忆设置，请刷新后重试。', unavailable: '记忆服务或已配置项目当前不可用，无法确认开关状态。',
  unconfirmed: '保存结果未确认，已尝试重新读取当前状态；不会自动重复提交。',
  conflict: '设置已被其他操作更改，已重新读取。请核对后再调整。', runtimeUnavailable: '记忆运行状态异常：',
} as const;
export type MemoryLocaleKey = keyof typeof zh;
export const en: Record<MemoryLocaleKey, string> = {
  title: 'Memory enhancement', master: 'Automatic memory enhancement', capture: 'Learn new information automatically', recall: 'Recall existing memory automatically', project: 'Project', refresh: 'Refresh',
  scope: 'Project setting: affects sessions in the selected project and combines with Standard, PTC, Creative and Minimal modes.',
  masterHelp: 'The main switch enables or pauses both options. You can also enable either option separately.',
  noDelete: 'Turning this off does not delete stored memories or stop manual queries, editing, deletion or expiry management. Information already in this conversation remains there.',
  stored: 'Saved', readAt: 'Last confirmed', on: 'On', off: 'Off', effective: 'Effective', paused: 'Paused', capped: 'Limited by Host configuration', ineffective: 'Currently inactive',
  loading: 'Reading project memory settings…', saving: 'Waiting for current memory processing; changes apply after saving. Do not submit again.',
  freshness: 'Last-read state. Other sessions may change these settings; refresh to check. Changes apply at the next memory operation.',
  readError: 'Could not read memory settings. Refresh to try again.', unavailable: 'The memory service or configured projects are unavailable; switch state cannot be confirmed.',
  unconfirmed: 'Save outcome is uncertain. A fresh read was attempted; the mutation is never retried automatically.',
  conflict: 'Another operation changed these settings. They have been read again; review before changing them.', runtimeUnavailable: 'Memory runtime issue: ',
};
