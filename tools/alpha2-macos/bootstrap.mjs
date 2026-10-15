// Local preparation only; no native macOS success is inferred from Windows.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const repo='D:/AIData/ProjectWork/DSH/github-beta-publication-20261001/repository';
const out='D:/AIData/ProjectWork/DSH/alpha2-macos-20261014-r1';
const git=args=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();
const sha=async p=>{const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');};
assert.equal(git(['rev-parse','HEAD']),'79e07bfd6993be8cfb0d354bb24019c6c4d64bcc');
assert.equal(git(['diff','--name-only']),'docs/BUNDLE15-REVIEW-RESPONSE.md');
assert.equal(git(['diff','--cached','--name-only']),'');
await mkdir(out);assert.equal((await realpath(out)).replaceAll('\\','/').toLowerCase(),out.toLowerCase());
const before='D:/AIData/ProjectWork/DSH/alpha2-linux-wayland-20261014-r1/source-checkpoint.bundle';
assert.equal(await sha(before),'a0f9f887678bfc069afd47f29f9f88ecb531e13aa2cf717266e0c03d15556421');
const checkpoint=join(out,'source-before.bundle');await copyFile(before,checkpoint);assert.equal(await sha(checkpoint),await sha(before));git(['bundle','verify',checkpoint]);
const old='D:/AIData/ProjectWork/DSH/cross-platform-20260929/desktop-r8';
const oldResult=JSON.parse(await readFile(join(old,'RESULT.json')));assert.equal(oldResult.status,'pass');
const mac=oldResult.platforms.find(x=>x.platform==='darwin-arm64');assert.equal(mac.status,'pass');assert.equal(mac.desktopRounds,9);
const oldManifest=join(old,'macos-evidence/sep-desktop-r8/bundle-full/manifest.json');const manifest=JSON.parse(await readFile(oldManifest));assert.equal(manifest.hostVersion,'0.1.7-rc.2');
const daily='C:/Users/PUBLIC_USER/Documents/ChatGPT/DSH SYSTEM ENHANCEMENT PACKAGE/dsh-daily';const dailyActual={};
for(const [path,want]of Object.entries({'launch.mjs':'da140dbad22fa4f6557d98f73e192e1135b29431dba08c0f9b13e4dd3977bf9f','deployment-rc2.json':'29e3d72617ecb35f97849eccca94d03395408be6dfa4ebef2dc350846f0f0175'})){dailyActual[path]=await sha(join(daily,path));assert.equal(dailyActual[path],want);}
const userSha=await sha(join(repo,'docs/BUNDLE15-REVIEW-RESPONSE.md'));assert.equal(userSha,'a7ea53338c300162a175e9fa69c491779eb63f04335b4b20b01dabeff3c8a6c1');
const result={schema:1,status:'pass',scope:'read-only checkpoint and historical native Mac evidence inventory; not macOS execution',sourceCommit:git(['rev-parse','HEAD']),target:{dsh:'0.2.1-alpha.2',officialCommit:'d743267388641bc76f17c45ce8b4c231aed1d32c',arch:'arm64',publicRelease:false},checkpoint:{path:'source-before.bundle',sha256:await sha(checkpoint)},historicalMac:{host:manifest.hostVersion,codeCommit:oldResult.testedCodeCommit,run:oldResult.macosRun,platform:'darwin-arm64',desktopRounds:mac.desktopRounds,releaseReady:oldResult.releaseReady,resultSha256:await sha(join(old,'RESULT.json')),manifestSha256:await sha(oldManifest)},environmentInventory:{windowsMacVirtualizerFound:false,knownWsl:['DSH-SEP-Eval','DSH-SEP-Linux-RC','FriendDomain-Demo'],macNativeStatus:'not_run',interpretation:'no runnable local Mac entry located in PATH, active virtualizer processes, known registration paths or D:/AIData disk inventory; absence elsewhere is not asserted'},dailyActual,userEditSha256:userSha,dailyChanged:false,published:false};
await writeFile(join(out,'CHECKPOINT-BEFORE.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
