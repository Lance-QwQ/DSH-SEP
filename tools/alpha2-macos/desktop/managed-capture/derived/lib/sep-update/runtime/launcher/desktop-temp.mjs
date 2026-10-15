import{mkdir,lstat,realpath}from'node:fs/promises';import{join}from'node:path';import{createHash}from'node:crypto';
// Chromium places its Unix single-instance socket under TMPDIR. Installation
// paths can exceed sockaddr_un limits; keep only desktop IPC/temp in a private,
// deterministic per-instance OS temporary directory. Persistent data stays put.
export async function desktopEnvironment(config,env,{platform=process.platform,parent='/tmp'}={}){
 if(platform==='win32')return env;
 if(!['linux','darwin'].includes(platform))throw Error('DESKTOP_TEMP_PLATFORM');
 const uid=process.getuid(),base=await realpath(parent),identity=await realpath(config.dailyRoot);
 const root=join(base,'dsh-sep-'+uid+'-'+createHash('sha256').update(identity).digest('hex').slice(0,20));
 if(Buffer.byteLength(join(root,'scoped_dir123456/SingletonSocket'))>=104)throw Error('DESKTOP_TEMP_PATH_LIMIT');
 try{await mkdir(root,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
 const s=await lstat(root);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==uid||(s.mode&0o777)!==0o700||await realpath(root)!==root)throw Error('DESKTOP_TEMP_UNSAFE');
 return{...env,TEMP:root,TMP:root,TMPDIR:root};
}
