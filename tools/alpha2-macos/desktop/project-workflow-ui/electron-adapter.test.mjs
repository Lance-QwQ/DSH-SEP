import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installMainHandlers,createPreloadApi} from './electron-adapter.mjs';
import {fixture,defer} from './portable-fixture.mjs';
function electron(f){const handlers=new Map(),events=new EventEmitter();Object.assign(f.window.webContents,{on:events.on.bind(events),removeListener:events.removeListener.bind(events)});const ipcMain={handle:(k,v)=>{if(handlers.has(k))throw Error('duplicate');handlers.set(k,v);},removeHandler:k=>handlers.delete(k)};const dispose=installMainHandlers({ipcMain,webContents:f.window.webContents,bridge:f.main});const api=createPreloadApi({invoke:(name,...args)=>handlers.get(name)(f.event,...args)});return {handlers,events,dispose,api};}
test('preload exports intents only and binds Electron sender through main handlers',async()=>{
 const f=await fixture();try{const e=electron(f);assert.deepEqual(Object.keys(e.api).sort(),['begin','call','commit','presented']);await e.api.begin();assert.equal((await e.api.call('status',{})).admissionOpen,true);await assert.rejects(e.api.call('confirmCommit',{approval:true}));assert.equal(f.commits,0);e.dispose();assert.equal(e.handlers.size,0);}finally{await f.cleanup();}
});
test('main-frame navigation event aborts pending native dialog; late acceptance cannot dispatch',async()=>{
 const entered=defer(),release=defer(),f=await fixture({confirm:async()=>{entered.resolve();return release.promise;}});
 try{const e=electron(f),r=await f.review(),action=assert.rejects(e.api.commit({reviewId:r.reviewId}));await entered.promise;e.events.emit('did-start-navigation',{},'dsh-app://app/index.html',false,true);release.resolve({accepted:true,omissionsAcknowledged:false});await action;assert.equal(f.commits,0);e.dispose();}finally{await f.cleanup();}
});
test('destroyed event closes admission and retained handlers remain refused after disposal',async()=>{
 const f=await fixture();try{const e=electron(f);await e.api.begin();const retained=e.handlers.get('sep-current-project:call');e.events.emit('destroyed');e.dispose();await assert.rejects(retained(f.event,'status',{}),{code:'SEP_PROJECT_UI_CLOSED'});}finally{await f.cleanup();}
});
