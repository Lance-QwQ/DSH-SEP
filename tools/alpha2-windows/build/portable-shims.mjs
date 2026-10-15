export function portableShim(text,kind){
 const fail=()=>{throw Object.assign(Error('SHIM_TEMPLATE_CHANGED'),{code:'SHIM_TEMPLATE_CHANGED'});};
 const re=kind==='cmd'?/^@IF NOT DEFINED NODE_PATH \(\r?\n  @SET "NODE_PATH=D:[^\r\n]+\r?\n\) ELSE \(\r?\n  @SET "NODE_PATH=D:[^\r\n]+\r?\n\)\r?\n/m:kind==='sh'?/^if \[ -z "\$NODE_PATH" \]; then\r?\n  export NODE_PATH="\/mnt\/d\/[^\r\n]+\r?\nelse\r?\n  export NODE_PATH="\/mnt\/d\/[^\r\n]+\r?\nfi\r?\n/m:null;
 if(!re||!re.test(text))fail();const out=text.replace(re,'').replace(/^# cmd-shim-target=D:\/AIData\/[^\r\n]*\r?\n?/mg,'');
 if(/AIData|\/mnt\/d|NODE_PATH/.test(out))fail();return out;
}
