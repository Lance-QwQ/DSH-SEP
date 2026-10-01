import {renderAdoptionReview} from './adoption-presentation.js';

const ENTER='\x1b[?1049h\x1b[?25l';
const CLEAR='\x1b[2J\x1b[H';
const LEAVE=CLEAR+'\x1b[?25h\x1b[?1049l\x1b[?25h';
const failure=code=>Object.assign(new Error(code),{code});
const bounded=error=>failure(typeof error?.code==='string'&&/^(?:P2_ADOPTION_[A-Z_]+|P2_PLAN_CHANGED|ADOPTION_[A-Z_]+)$/.test(error.code)&&error.code.length<=100?error.code:'P2_ADOPTION_REVIEW_INVALIDATED');

/** Call before reading a plan or a body. Node TTY/VT streams are required; a
 * redirected descriptor or a dumb terminal is not a private review surface. */
export function assertReviewTerminal({input=process.stdin,output=process.stdout,error=process.stderr}={}){
  if([input,output,error].some(s=>s?.isTTY!==true||typeof s.on!=='function'||typeof s.removeListener!=='function'||s.destroyed)||
    typeof input.setRawMode!=='function'||typeof input.resume!=='function'||typeof input.pause!=='function'||typeof output.write!=='function'||typeof error.write!=='function'||
    !Number.isSafeInteger(output.rows)||output.rows<8||output.rows>1000||!Number.isSafeInteger(output.columns)||output.columns<40||output.columns>2000||
    output.writableEnded||error.writableEnded||input.readableEnded||process.env.TERM==='dumb')throw failure('P2_ADOPTION_REVIEW_TTY_REQUIRED');
  return {input,output,error};
}

function pagesOf(text,rows,columns){
  const width=Math.max(1,Math.floor((columns-1)/2)),lines=[];
  for(const line of text.split('\n')){
    const points=Array.from(line);if(!points.length)lines.push('');
    for(let i=0;i<points.length;i+=width)lines.push(points.slice(i,i+width).join(''));
  }
  const pages=[],height=rows-3;
  for(let i=0;i<lines.length;i+=height)pages.push(lines.slice(i,i+height));
  return pages.length?pages:[[]];
}

/** Ephemeral display only. Clear/alternate-screen exit cannot erase external
 * recordings, screenshots or terminal history retained by the terminal itself.
 * The independent deadline clears this surface even if assertValid is pending;
 * that callback must perform read-only validity checks and must not emit bodies. */
export async function showAdoptionReview(view,{expiresAt,assertValid,input=process.stdin,output=process.stdout,error=process.stderr}={}){
  assertReviewTerminal({input,output,error});
  if(!Number.isSafeInteger(expiresAt)||typeof assertValid!=='function')throw failure('P2_ADOPTION_REVIEW_INVALID');
  const startedAt=Date.now(),deadline=Math.min(expiresAt,startedAt+300000);
  if(deadline<=startedAt)throw failure('P2_ADOPTION_REVIEW_EXPIRED');
  const rows=output.rows,columns=output.columns,wasRaw=input.isRaw===true,wasFlowing=input.readableFlowing===true;
  let entered=false,rawChanged=false,ended=false,problem=null,reason='user',page=0,pages=[],tail=Promise.resolve(),pendingPeriodic=false,lastCR=false;
  let finish;const finished=new Promise(resolve=>{finish=resolve;});
  const stop=(error,why='user')=>{if(ended)return;ended=true;problem=error;reason=why;finish();};
  const io=()=>stop(failure('P2_ADOPTION_REVIEW_IO'));
  const endInput=()=>stop(null,'eof');
  function write(text){
    if(ended)return;
    try{output.write(text,err=>{if(err)io();});}catch{io();}
  }
  function timeValid(){
    if(Date.now()<startedAt)throw failure('P2_ADOPTION_REVIEW_INVALIDATED');
    if(Date.now()>=deadline)throw failure('P2_ADOPTION_REVIEW_EXPIRED');
    assertReviewTerminal({input,output,error});
    if(output.rows!==rows||output.columns!==columns)throw failure('P2_ADOPTION_REVIEW_TTY_REQUIRED');
  }
  async function validate(){
    timeValid();const result=await assertValid();if(ended)return false;
    if(result===false)throw failure('P2_ADOPTION_REVIEW_INVALIDATED');timeValid();return true;
  }
  function queue(fn){tail=tail.then(async()=>{if(!ended)await fn();}).catch(e=>stop(bounded(e)));}
  function draw(){write(CLEAR+`Review ${page+1}/${pages.length}\r\n`+pages[page].join('\r\n')+'\r\nEnter/Space: next | q: close');}
  function data(chunk){
    for(const key of chunk.toString('utf8')){
      if(ended)return;
      if(key==='q'||key==='Q'||key==='\x03'){stop(null,'user');return;}
      if(key==='\x04'){endInput();return;}
      if(key==='\n'&&lastCR){lastCR=false;continue;}
      lastCR=key==='\r';
      if(key===' '||key==='\r'||key==='\n')queue(async()=>{
        if(!await validate())return;
        if(page+1>=pages.length){stop(null,'user');return;}page++;draw();
      });
    }
  }
  const resize=()=>{if(output.rows!==rows||output.columns!==columns)stop(failure('P2_ADOPTION_REVIEW_TTY_REQUIRED'));};
  input.on('data',data);input.on('end',endInput);input.on('close',endInput);input.on('error',io);
  output.on('error',io);output.on('close',io);output.on('resize',resize);error.on('error',io);error.on('close',io);
  const timeout=setTimeout(()=>stop(failure('P2_ADOPTION_REVIEW_EXPIRED')),Math.max(0,deadline-Date.now()));
  const interval=setInterval(()=>{
    if(ended||pendingPeriodic)return;pendingPeriodic=true;
    queue(async()=>{try{await validate();}finally{pendingPeriodic=false;}});
  },1000);
  try{
    queue(async()=>{
      if(!await validate())return;
      pages=pagesOf(renderAdoptionReview(view),rows,columns);
      input.setRawMode(true);rawChanged=true;input.resume();entered=true;write(ENTER);draw();
    });
    await finished;
  }finally{
    clearTimeout(timeout);clearInterval(interval);
    input.removeListener('data',data);input.removeListener('end',endInput);input.removeListener('close',endInput);output.removeListener('resize',resize);
    if(entered){
      const destination=output.destroyed||output.writableEnded?error:output;
      try{if(!destination.destroyed&&!destination.writableEnded)destination.write(LEAVE,()=>{});}catch{
        try{if(destination!==error&&!error.destroyed&&!error.writableEnded)error.write(LEAVE,()=>{});}catch{}
      }
    }
    try{if(rawChanged)input.setRawMode(wasRaw);if(!wasFlowing)input.pause();}catch{problem??=failure('P2_ADOPTION_REVIEW_IO');}
    // Keep error listeners through the queued stream write/error notifications.
    await new Promise(resolve=>setImmediate(resolve));
    input.removeListener('error',io);output.removeListener('error',io);output.removeListener('close',io);error.removeListener('error',io);error.removeListener('close',io);
  }
  if(problem)throw problem;
  return {status:'closed',reason};
}
