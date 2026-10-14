// Definition entry for local inspection. CI uses native-launch-runner.mjs so an
// unknown cleanup cannot hang the test driver or be mistaken for a clean exit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeLaunchCase,nativeCaseNames} from './native-launch-cases.mjs';
const enabled=process.platform==='darwin'&&process.arch==='arm64'&&process.env.SEP_PRODUCT_NATIVE_PROGRAM&&process.env.SEP_PRODUCT_NATIVE_PROGRAM_SHA256&&process.env.SEP_PRODUCT_TEST_ROOT;
for(const index of [1,2])test(nativeCaseNames[index-1],{skip:!enabled?'requires assembled schema4 product on native macOS arm64':false},async()=>{
 const r=await runNativeLaunchCase(index,{programPath:process.env.SEP_PRODUCT_NATIVE_PROGRAM,programSha256:process.env.SEP_PRODUCT_NATIVE_PROGRAM_SHA256,testRoot:process.env.SEP_PRODUCT_TEST_ROOT});assert.equal(r.status,'pass',r.code??r.cleanup.code);
});
