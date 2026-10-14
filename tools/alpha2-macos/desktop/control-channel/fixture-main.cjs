// Test-only Electron entry. Never install this as a product entry point.
const {app,BrowserWindow}=require('electron');
const {fstatSync,readFileSync,mkdirSync}=require('node:fs');
const {Socket}=require('node:net');
const {createHash}=require('node:crypto');
const {join}=require('node:path');
const modes=new Set(['duplex','wrong-nonce','replay','eof']);
let socket,window,done=false;
const receipt={scope:'synthetic Electron fd3 transport only',status:'fail',platform:process.platform,arch:process.arch,pid:process.pid,electron:process.versions.electron??null,node:process.versions.node,packaged:app.isPackaged};
function finish(status,detail={}){
  if(done)return;done=true;Object.assign(receipt,{status},detail);
  if(window&&!window.isDestroyed())window.destroy();
  process.stdout.write('SEP_CONTROL_FIXTURE '+JSON.stringify(receipt)+'\n',()=>{process.exitCode=status==='pass'?0:1;app.quit();});
}
app.on('window-all-closed',()=>{});
async function firstFrame(){
  return new Promise((resolve,reject)=>{
    let data=Buffer.alloc(0);const timer=setTimeout(()=>reject(Error('SEP_CONTROL_FIXTURE_HELLO_TIMEOUT')),10000);
    function receive(chunk){
      if(data.length+chunk.length>4097){clearTimeout(timer);reject(Error('SEP_CONTROL_FIXTURE_FRAME_LIMIT'));return;}
      data=Buffer.concat([data,chunk]);const at=data.indexOf(10);if(at<0)return;
      clearTimeout(timer);socket.pause();socket.removeListener('data',receive);
      if(at!==data.length-1){reject(Error('SEP_CONTROL_FIXTURE_FIRST_FRAME'));return;}
      resolve(data);
    }
    socket.on('data',receive);socket.once('end',()=>{clearTimeout(timer);reject(Error('SEP_CONTROL_FIXTURE_FIRST_EOF'));});
  });
}
(async()=>{
  const mode=process.env.SEP_CONTROL_CASE;receipt.case=mode;
  if(!modes.has(mode)||!process.versions.electron||process.platform!=='darwin'||process.arch!=='arm64'||!app.isPackaged)throw Error('SEP_CONTROL_FIXTURE_PLATFORM');
  const descriptor=fstatSync(3);receipt.fd3={isSocket:descriptor.isSocket(),isFIFO:descriptor.isFIFO()};
  if(!receipt.fd3.isSocket&&!receipt.fd3.isFIFO)throw Error('SEP_CONTROL_FIXTURE_FD_TYPE');
  socket=new Socket({fd:3,readable:true,writable:true});
  socket.on('error',error=>finish('fail',{code:'SEP_CONTROL_FIXTURE_IO',errno:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:null}));
  const initial=await firstFrame(),hello=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(initial));
  const actualProgram=createHash('sha256').update(readFileSync(join(process.resourcesPath,'app.asar'))).digest('hex');
  if(hello.programSha256!==actualProgram)throw Error('SEP_CONTROL_FIXTURE_PROGRAM');
  const binding={nonce:hello.nonce,programSha256:hello.programSha256,generation:hello.generation};
  // No binding travels through env, argv, preload, renderer URL or JS globals.
  const renderer=(async()=>{
    const data=join(process.env.HOME,'user-data');mkdirSync(data,{recursive:true,mode:0o700});app.setPath('userData',data);app.setPath('sessionData',data);
    await app.whenReady();window=new BrowserWindow({show:false,width:320,height:160,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadURL('data:text/html,<meta charset="utf-8"><body>SEP fd3 fixture</body>');
    const view=await window.webContents.executeJavaScript('({text:document.body.textContent,process:typeof process,require:typeof require,control:typeof globalThis.sepControl})');
    if(view.text!=='SEP fd3 fixture'||view.process!=='undefined'||view.require!=='undefined'||view.control!=='undefined')throw Error('SEP_CONTROL_FIXTURE_RENDERER');
    receipt.rendererTextSha256=createHash('sha256').update(view.text).digest('hex');receipt.rendererNodeAccess=false;receipt.rendererControlApi=false;receipt.appReady=true;receipt.rendererLoaded=true;
  })();
  if(mode==='duplex'){
    const {createProbeChannel}=await import('./channel.mjs');
    const channel=createProbeChannel({stream:socket,binding,role:'responder'});
    socket.unshift(initial);socket.resume();
    const [terminal]=await Promise.all([channel.whenClosed,renderer]);
    const expected=terminal.acceptedRequests===9&&terminal.state==='blocked'&&terminal.code==='SEP_CONTROL_EOF';
    finish(expected?'pass':'fail',{acceptedRequests:terminal.acceptedRequests,terminalState:terminal.state,terminalCode:terminal.code});
  }else{
    // Deliberate peer faults are isolated to this synthetic fixture.
    let buffer=Buffer.alloc(0),seen=0;
    socket.on('data',chunk=>{
      if(buffer.length+chunk.length>4096){finish('fail',{code:'SEP_CONTROL_FIXTURE_FRAME_LIMIT'});return;}
      buffer=Buffer.concat([buffer,chunk]);let at;
      while((at=buffer.indexOf(10))>=0){const bytes=buffer.subarray(0,at);buffer=buffer.subarray(at+1);let frame;
        try{frame=JSON.parse(bytes.toString('utf8'));}catch{finish('fail',{code:'SEP_CONTROL_FIXTURE_FRAME'});return;}
        seen++;
        if(mode==='eof'){socket.end();break;}
        const ack={protocol:1,kind:'ack',...binding,requestId:mode==='replay'?'000000000000000000000001':frame.requestId};
        if(mode==='wrong-nonce')ack.nonce='0'.repeat(64);
        socket.write(JSON.stringify(ack)+'\n');
      }
    });
    socket.on('close',()=>{renderer.then(()=>finish(seen===(mode==='replay'?2:1)?'pass':'fail',{faultInjected:mode,requestsObserved:seen}),()=>finish('fail',{code:'SEP_CONTROL_FIXTURE_RENDERER'}));});
    socket.unshift(initial);socket.resume();
  }
})().catch(error=>finish('fail',{code:/^SEP_CONTROL_[A-Z_]+$/.test(error.message)?error.message:'SEP_CONTROL_FIXTURE_START',errno:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:null}));
