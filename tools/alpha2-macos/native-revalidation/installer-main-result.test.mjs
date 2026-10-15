// Fixed behavioral definitions for the native integration entry. The initial
// native stub is expected to fail these; setup failure is not a RED result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {payloadPins} from './installer-binding.mjs';const fixedPayload=await payloadPins();
const report=JSON.parse(await readFile(process.env.SEP_INSTALLER_INTEGRATION_RESULT,'utf8'));
const success=()=>assert.equal(report.status,'pass','actual native integration entry must complete, not the NI stub');
test('actual test entry binds unchanged production UI and real fixed controller',()=>{
 success();assert.equal(report.testEntry,true);assert.equal(report.productionMainByteIdentical,false);assert.equal(report.productionModulesByteIdentical,true);assert.equal(report.realController,true);assert.equal(report.mockTransport,false);assert.equal(report.mockReply,false);assert.equal(report.nativeAdmissionVerified,true);assert.match(report.manifestSha256,/^[a-f0-9]{64}$/);assert.equal(report.productionInputs.length,11);
});
test('cancel-review uses the actual enabled button and does not install',()=>{
 success();assert.equal(report.cancelReview.actualButtonIdentifier,'cancel-review');assert.equal(report.cancelReview.beforePhase,'preview');assert.equal(report.cancelReview.afterPhase,'cancelled');assert.equal(report.cancelReview.accountUnchanged,true);assert.equal(report.cancelReview.targetAbsent,true);
});
test('actual attached confirmation sheet Cancel preserves the reviewed plan',()=>{
 success();assert.equal(report.cancelSheet.attachedToInstaller,true);assert.equal(report.cancelSheet.actualButtonTitle,'Cancel');assert.equal(report.cancelSheet.directEndSheetUsed,false);assert.equal(report.cancelSheet.beforePlanHash,report.cancelSheet.afterPlanHash);assert.equal(report.cancelSheet.afterPhase,'preview');assert.equal(report.cancelSheet.targetAbsent,true);
});
test('actual attached confirmation sheet Install commits its displayed plan',()=>{
 success();assert.equal(report.confirmSheet.attachedToInstaller,true);assert.equal(report.confirmSheet.actualButtonTitle,'Install');assert.equal(report.confirmSheet.directEndSheetUsed,false);assert.match(report.confirmSheet.planHash,/^[a-f0-9]{64}$/);assert.equal(report.confirmSheet.phase,'committed');assert.equal(report.confirmSheet.recordedPlanHash,report.confirmSheet.planHash);assert.equal(report.confirmSheet.approved,true);
});
test('installed fixed payload verifies completely before any product launch',()=>{
 success();assert.equal(report.installed.fullInventoryVerified,true);assert.equal(report.installed.signatureVerified,true);assert.equal(report.installed.entries,fixedPayload.entries);assert.equal(report.installed.totalBytes,fixedPayload.totalBytes);assert.equal(report.installed.sourceUnchanged,true);assert.equal(report.installed.applicationStarted,false);assert.equal(report.installed.dataRootAbsent,true);
});
test('normal close requires real UI release, controller EOF and exact child exit',()=>{
 success();assert.equal(report.close.uiResourcesReleased,true);assert.equal(report.close.controllerClosedReceipt,true);assert.equal(report.close.controllerOutputEOF,true);assert.equal(report.close.controllerExited,true);assert.equal(report.close.controllerExitCode,0);assert.equal(report.close.controllerSignalled,false);assert.equal(report.close.testEntryExitCode,0);assert.equal(report.close.forcedTermination,false);assert.equal(report.close.cleanupUnconfirmed,false);
});
