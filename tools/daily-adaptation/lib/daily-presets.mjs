const fail=()=>{throw Object.assign(Error('SEP_DAILY_PRESET_UNSUPPORTED'),{code:'SEP_DAILY_PRESET_UNSUPPORTED'});};

/** Generate a reviewed cold profile overlay, without editing native packages.
 * Standard/Cordis/PTC retain their command and result-pruner rows, but inherit the
 * host-owned lossless engine. User rows and native package bytes are retained.
 * Unknown topology refuses preparation instead of discarding a customization.
 * The caller binds both effective input and output bytes in the outer plan. */
export function adaptDailyPresets(rows){
 if(!Array.isArray(rows)||rows.length!==4)fail();
 const names=new Set(),output=[];
 for(const input of rows){
  if(input?.name!=='@deepseek-ai/dsh-agent-preset'||!['standard','cordis','minimal','ptc'].includes(input.config?.id)||input.id!=='preset-'+input.config.id||names.has(input.config.id)||!Array.isArray(input.config.plugins))fail();
  names.add(input.config.id);const row=structuredClone(input);
  const groups=row.config.plugins.filter(plugin=>plugin.id==='compaction');
  if(['standard','cordis','ptc'].includes(row.config.id)){
   if(groups.length!==1)fail();const group=groups[0];
   if(group.name!=='cordis:group'||group.group!==true||group.isolate?.compaction!==true||group.isolate?.toolResultPruner!==true||!Array.isArray(group.config))fail();
   const engines=group.config.filter(plugin=>plugin.id==='compaction-basic');
   if(engines.length!==1||engines[0].name!=='@deepseek-ai/dsh-compaction-basic'||engines[0].disabled===true)fail();
   delete group.isolate.compaction;engines[0].disabled=true;
   output.push({id:row.id,config:row.config});
  }else if(groups.length)fail();
 }
 return output;
}
