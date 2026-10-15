import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProfileSelection} from '../lib/daily-profile.mjs';
const fixture=()=>({programRoot:'D:/program',project:{id:'00000000-0000-4000-8000-000000000013',root:'D:/project'},roots:{sessions:'D:/sessions',memory:'D:/memory',locks:'D:/locks',backups:'D:/backups'},budgetPath:'D:/budget.json',savedSourceRoot:'D:/saved',suite:{projects:[{sources:['knowledge'],userProfile:'daily-user'}],memoryAutomation:{capture:true,recall:true,model:'deepseek-flash'},modules:{media:true},vision:{model:'deepseek-flash'},p1:{enabled:true,model:'deepseek-v4-pro',limitCny:100,initialSpentCny:3.91,prework:true,profileLimits:{maxOutputTokens:32768,maxInputBytes:2000000}}},patches:[{id:'fs-sandbox',config:{cwd:'old',recovery:{maxFileBytes:67108864,maxTotalBytes:1073741824,maxEntries:1000,retentionMs:2592000000}}},{id:'cordis-host-runner',config:{persistence:{root:'old',projectRoot:'old',maxPlugins:32}}},{id:'storage-json',config:{root:'old'}},{id:'session-persistence-jsonl',config:{root:'old'}},{insert:[{id:'sep-suite',name:'old-suite',config:{enabled:true}},{id:'sep-brand',name:'old-brand',config:{}},{id:'user-plugin',name:'user-package',config:{keep:'exact'}}]},{id:'agent-default-model',config:{model:'keep'}},{id:'ui-chat',config:{transcriptView:'detailed'}}]});
test('daily profile replaces only enumerated SEP owners and preserves user rows and budget identity',()=>{
 const input=fixture(),before=structuredClone(input),result=buildProfileSelection(input);
 assert.deepEqual(input,before);assert.deepEqual(result.patches.find(row=>row.insert?.some(p=>p.id==='user-plugin')),{insert:[{id:'user-plugin',name:'user-package',config:{keep:'exact'}}]});
 assert.deepEqual(result.patches.find(row=>row.id==='ui-chat'),before.patches.find(row=>row.id==='ui-chat'));
 assert.equal(result.runtime.p1.budgetPath,input.budgetPath);assert.equal(result.runtime.p1.initialSpentCny,0);assert.equal(result.runtime.p1.prework,true);
 assert.equal(result.runtime.business.capture,true);assert.equal(result.runtime.business.captureModel,'deepseek-flash');assert.equal(result.runtime.business.click.serverName,'sep_windows');
 assert.equal(result.runtime.profile.selection.roots.sessions,input.roots.sessions);
 assert.ok(result.patches.find(row=>row.id==='attachment-local'&&row.disabled));
 assert.ok(result.patches.flatMap(row=>row.insert??[]).some(row=>row.id==='sep-daily-attachments'));
 assert.ok(result.patches.find(row=>row.id==='session-persistence-jsonl'&&row.disabled));
 assert.ok(!result.patches.flatMap(row=>row.insert??[]).some(row=>row.id==='sep-suite'));
 assert.equal(result.patches.find(row=>row.id==='cordis-host-runner').config.persistence.maxPlugins,32);
});
test('daily profile rejects ambiguous owned rows and unsupported existing policies',()=>{
 const input=fixture();input.patches.push({id:'fs-sandbox',config:{}});assert.throws(()=>buildProfileSelection(input),/SEP_DAILY_PROFILE_AMBIGUOUS/);
 const second=fixture();second.suite.vision.model='a-different-model';assert.throws(()=>buildProfileSelection(second),/SEP_DAILY_VISION_MODEL/);
});
