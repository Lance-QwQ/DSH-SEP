// Test-only Node child. Its synthetic readiness is never packaged as a product gate.
const {Socket}=require('node:net');const {createElectronEndpoint}=require('./electron.cjs');
const stream=new Socket({fd:3,readable:true,writable:true}),mode=process.argv[2];let quits=0;
const endpoint=createElectronEndpoint({stream,programSha256:'b'.repeat(64),isReady:()=>true,canActivate:()=>true,activate:()=>{if(mode==='welcome')endpoint.ready({schema:1,surface:'workspace',rootCommitted:true,loaderCompleted:true,windowId:2});return true;},requestQuit(){if(mode==='cancel'&&quits++===0){endpoint.quitCancelled();return;}endpoint.quitting();if(mode==='bad-exit')process.exitCode=1;stream.end();},onFailure(){process.exitCode=1;stream.destroy();}});
if(mode!=='no-ready')endpoint.ready(mode==='welcome'?{schema:1,surface:'welcome',rootCommitted:true,handlersBound:true,windowId:1}:{schema:1,surface:'workspace',rootCommitted:true,loaderCompleted:true,windowId:1});
