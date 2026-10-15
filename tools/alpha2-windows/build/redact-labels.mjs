const fail=code=>{throw Object.assign(Error(code),{code});};
export function redactBuildLabels(text){
 let count=0;
 const lines=text.split('\n').map(line=>{
  if(!/[A-Z]:[\\/]AIData[\\/]ProjectWork[\\/]DSH[\\/]/i.test(line))return line;
  if(!/^\s*(?:\/\/|\/\*|\*|"[^"\r\n]+"\([^\r\n]*\)\s*\{)/.test(line))fail('PACKAGE_BUILD_PATH_NOT_LABEL');
  const replaced=line.replace(/[A-Z]:[\\/]AIData[\\/]ProjectWork[\\/]DSH[\\/][^\s"'<>]*?(?:desktop-source|host-alpha2|official-source[\\/]deepseek-harness-dsh-v0\.2\.1-alpha\.2|alpha2-runtime-r2|(?=tools[\\/]daily-adaptation)[^\s"'<>]*?tools)[\\/]([^\s"'<>]*)/gi,(_,tail)=>{count++;return 'sep-build/'+tail.replaceAll('\\','/');});
  if(/[A-Z]:[\\/]AIData[\\/]ProjectWork[\\/]DSH[\\/]/i.test(replaced))fail('PACKAGE_BUILD_LABEL_UNKNOWN');
  return replaced;
 });
 return {text:lines.join('\n'),count};
}
