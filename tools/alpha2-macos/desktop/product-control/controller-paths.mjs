import{join,basename,dirname,isAbsolute,resolve,sep}from'node:path';
import{userInfo}from'node:os';
export const accountControllerLocations=controllerPath=>controllerLocations({controllerPath,home:userInfo().homedir});
export function controllerLocations({controllerPath,home}){
 const tail=join('Resources','product','runtime','bootstrap','controller.mjs'),bad=()=>{throw Object.assign(Error('SEP_PRODUCT_LAYOUT'),{code:'SEP_PRODUCT_LAYOUT'});};
 if(typeof controllerPath!=='string'||!isAbsolute(controllerPath)||resolve(controllerPath)!==controllerPath||!controllerPath.endsWith(sep+tail)||typeof home!=='string'||!isAbsolute(home)||resolve(home)!==home)bad();
 const contents=controllerPath.slice(0,-tail.length-1);if(basename(contents)!=='Contents'||!basename(dirname(contents)).endsWith('.app'))bad();
 return Object.freeze({programPath:join(contents,'Resources','PROGRAM.json'),nodePath:join(contents,'Helpers','DSH SEP Desktop.app','Contents','Resources','runtime','primary-runtime','dependencies','node','bin','node'),dataRoot:join(home,'Library','Application Support','DSH SEP','alpha2-mac-finder-preview')});
}
