export function verifyTap(text,expected){
 const stats={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const matches=[...text.matchAll(new RegExp('^# '+key+' ([0-9]+)\\r?$','gm'))];if(matches.length!==1)throw Object.assign(Error('SEP_NATIVE_TEST_COUNTS'),{code:'SEP_NATIVE_TEST_COUNTS'});stats[key]=Number(matches[0][1]);}
 if(stats.tests!==expected||stats.pass!==expected||stats.fail||stats.cancelled||stats.skipped||stats.todo)throw Object.assign(Error('SEP_NATIVE_TEST_COUNTS'),{code:'SEP_NATIVE_TEST_COUNTS'});return stats;
}

const volumeFail=code=>{throw Object.assign(Error(code),{code});};
export function parseDfVolume(text){
 if(typeof text!=='string'||text.length>16384)volumeFail('SEP_NATIVE_VOLUME_MAPPING');
 const lines=text.trim().split(/\r?\n/);if(lines.length!==2||!/^Filesystem\s/.test(lines[0]))volumeFail('SEP_NATIVE_VOLUME_MAPPING');
 const row=/^(\/dev\/disk[0-9]+(?:s[0-9]+){0,2})\s+[0-9]+\s+[0-9]+\s+[0-9]+\s+[0-9]+%\s+(\/[^\r\n]*)$/.exec(lines[1]);
 if(!row||/[\x00-\x1f\x7f]/.test(row[2])||row[2].split('/').some(x=>x==='.'||x==='..'))volumeFail('SEP_NATIVE_VOLUME_MAPPING');
 return {device:row[1],mountPoint:row[2]};
}
export function verifyVolumeBinding({df,info,root,rootDev,mountDev,mountReal}){
 const type=info?.FilesystemType??info?.FileSystemPersonality;
 if(!df||info?.Error===true||typeof type!=='string'||type.toLowerCase()!=='apfs'||(Object.hasOwn(info??{},'Mounted')&&info.Mounted!==true)||info.DeviceNode!==df.device||info.MountPoint!==df.mountPoint||mountReal!==df.mountPoint||typeof root!=='string'||!root.startsWith('/')||typeof rootDev!=='bigint'||typeof mountDev!=='bigint'||rootDev!==mountDev)volumeFail('SEP_NATIVE_VOLUME_BINDING');
 // Some real diskutil versions omit Mounted. The successful df mapping,
 // real mount-point stat and equal st_dev establish volume membership.
 // APFS firmlinks can expose /Users on /System/Volumes/Data. st_dev binds
 // the actual volume without incorrectly requiring lexical path ancestry.
 return {type:'apfs',device:df.device,mountPoint:df.mountPoint,deviceId:rootDev.toString()};
}