// Build-time Alpha.2 Linux adaptation; refuses a different official program.
import {createHash} from 'node:crypto';
export const officialMainSha256='7b73e57d9f520b76a9dc149bbb08d7e7f3dbaaeb9f961809d3217f546efec357';
export const approvalAnchor='      if (approved) {\n        finishQuit();\n        return;\n      }';
const approvalReplacement='      if (approved) {\n        // GTK native response must unwind before destroying the main window.\n        setTimeout(() => { if (!quitting && !shellInstallerOwnsQuit) finishQuit(); }, 0);\n        return;\n      }';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function adaptLinuxDesktopMain(bytes){
 if(sha(bytes)!==officialMainSha256)throw Error('SEP_LINUX_DESKTOP_ORIGIN_CHANGED');
 const text=bytes.toString('utf8');if(text.split(approvalAnchor).length!==2)throw Error('SEP_LINUX_DESKTOP_ANCHOR_CHANGED');
 const result=Buffer.from(text.replace(approvalAnchor,approvalReplacement));
 return {bytes:result,origin:{schema:1,source:'official Alpha.2 apps/desktop compiled lib/main.js',sourceSha256:officialMainSha256,resultSha256:sha(result),changes:[{from:approvalAnchor,to:approvalReplacement,occurrences:1}],reason:'Electron 44 / GTK3 native Promise response followed by immediate main-window destruction reproducibly SIGSEGV; defer approved finishQuit to next task and recheck quitting/installer ownership',scope:'Linux derived desktop only; original confirmation and Host shutdown preserved'}};
}
