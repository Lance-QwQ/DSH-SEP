// Private fixed-bundle child entry. No model/HTTP route or configurable paths.
import{fixedEntryOptions}from'./entry-options.mjs';
import{loadInstallerConfiguration}from'./bundle-config.mjs';
import{openInstallerController}from'../installer-entry/controller.mjs';
import{runInstallerSession}from'./controller-session.mjs';
let controller,session;
try{
 process.umask(0o077);
 const options=fixedEntryOptions({moduleUrl:import.meta.url,argv:process.argv,execPath:process.execPath});
 const config=await loadInstallerConfiguration(options.contents,options.manifestSha256);
 controller=await openInstallerController(config);
 session=runInstallerSession({controller,nonce:options.nonce,input:process.stdin,output:process.stdout,fixedInventory:config.receipt.inventory});
 await session.whenClosed();
 process.stdin.pause();process.stdin.destroy();await new Promise(resolve=>process.stdout.end(resolve));
}catch(e){
 const code=/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_INSTALLER_STARTUP';
 process.stderr.write(JSON.stringify({status:'blocked',code})+'\n');
 if(controller){const r=await(session?session.close():controller.close());if(r?.status!=='pass'||r.resourcesReleased!==true){const retain=setInterval(()=>{},3600000);await controller.whenClosed();clearInterval(retain);}}
 process.stdin.pause();process.stdin.destroy();process.exitCode=78;
}
