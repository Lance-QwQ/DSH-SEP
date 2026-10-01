"""Private Linux lifecycle owner for one approved public evaluation directory."""
import os,sys,json,time,secrets,hashlib,fcntl,threading,subprocess,selectors,hmac,re
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

def identity(pid=None):
 pid=pid or os.getpid();p=Path('/proc')/str(pid)
 try:
  stat=(p/'stat').read_text();tail=stat[stat.rfind(')')+2:].split()
  if tail[0]=='Z':return None
  return {'pid':pid,'start':tail[19],'boot':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
 except FileNotFoundError:return None

def atomic(path,value):
 tmp=path.with_name(path.name+'.'+secrets.token_hex(8)+'.tmp')
 try:
  fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as f:json.dump(value,f,sort_keys=True);f.flush();os.fsync(f.fileno())
  os.replace(tmp,path);fd=os.open(path.parent,os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 finally:
  if tmp.exists():tmp.unlink()

class Guardian:
 def __init__(self,config,challenge,budgets=(5,10,25,30),recover=False):
  if not re.fullmatch('[a-f0-9]{64}',challenge):raise ValueError('CHALLENGE')
  if len(budgets)!=4 or not 0<budgets[0]<budgets[1]<budgets[2]<budgets[3]<=30:raise ValueError('DEADLINES')
  self.config=dict(config);self.challenge=challenge;self.budgets=budgets;self.recover=recover
  self.root=Path(config['state']);self.config_path=self.root/'lifecycle-worker-config.json';self.lease=None;self.worker=None;self.log=None;self.server=None;self.thread=None
  self.generation=secrets.token_hex(16);self.token=secrets.token_hex(32);self.lock=threading.Condition();self.rpc_lock=threading.Lock();self.close_lock=threading.Lock();self.inflight=0;self.accepted=0;self.fenced=True;self.response=None;self.buffer=b'';self.record=None
 def persist(self,value):atomic(self.root/'lifecycle.json',value)
 def worker_command(self):return [sys.executable,'-B',str(Path(__file__).with_name('lifecycle_worker.py')),str(self.config_path),str(os.getpid())]
 def _line(self,deadline):
  while b'\n' not in self.buffer:
   remaining=deadline-time.monotonic()
   if remaining<=0:raise TimeoutError('WORKER_DEADLINE')
   with selectors.DefaultSelector() as selector:
    selector.register(self.worker.stdout,selectors.EVENT_READ)
    if not selector.select(remaining):raise TimeoutError('WORKER_DEADLINE')
   chunk=os.read(self.worker.stdout.fileno(),8192)
   if not chunk:raise ValueError('WORKER_EXIT')
   self.buffer+=chunk
   if len(self.buffer)>131072:raise ValueError('WORKER_OUTPUT_LIMIT')
  line,self.buffer=self.buffer.split(b'\n',1);return json.loads(line)
 def rpc(self,op,body=None,deadline=None,business=False):
  deadline=deadline or time.monotonic()+20
  if not self.rpc_lock.acquire(timeout=max(0,deadline-time.monotonic())):raise TimeoutError('WORKER_BUSY')
  try:
   if business:
    with self.lock:
     if self.fenced:raise ValueError('ENTRY_CLOSED')
   ident=secrets.token_hex(8);payload=json.dumps({'id':ident,'op':op,'body':body}).encode()+b'\n'
   if len(payload)>51000:raise ValueError('INPUT_LIMIT')
   # At most four accepted bounded requests; a dedicated writer never blocks the owner.
   error=[]
   def write():
    try:
     remaining=memoryview(payload)
     while remaining:
      sent=self.worker.stdin.write(remaining)
      if not sent:raise OSError('PIPE_CLOSED')
      remaining=remaining[sent:]
     self.worker.stdin.flush()
    except Exception as exc:error.append(exc)
   writer=threading.Thread(target=write,daemon=True);writer.start();writer.join(max(0,deadline-time.monotonic()))
   if writer.is_alive():raise TimeoutError('WORKER_WRITE')
   if error:raise ValueError('WORKER_EXIT')
   reply=self._line(deadline)
   if reply.get('id')!=ident:raise ValueError('WORKER_PROTOCOL')
   if 'error' in reply:raise ValueError(reply['error'])
   return reply['value']
  finally:self.rpc_lock.release()
 def start(self):
  if not self.root.is_absolute() or self.root.resolve()!=self.root:raise ValueError('STATE_PATH')
  self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
  st=self.root.stat()
  if st.st_uid!=os.getuid() or st.st_mode&0o077:raise ValueError('STATE_PERMISSIONS')
  fd=os.open(self.root/'lifecycle.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:os.close(fd);raise ValueError('LEASE_BUSY')
  self.lease=fd
  try:
   state_id=hashlib.sha256(f'{self.root}:{st.st_dev}:{st.st_ino}'.encode()).hexdigest()
   config_hash=hashlib.sha256(json.dumps(self.config,sort_keys=True).encode()).hexdigest()
   path=self.root/'lifecycle.json'
   if path.exists():
    if path.is_symlink() or path.stat().st_size>65536:raise ValueError('OWNER_RECORD')
    previous=json.loads(path.read_text())
    if previous.get('configSha256')!=config_hash or previous.get('stateIdentity')!=state_id:raise ValueError('STATE_BINDING')
    if previous.get('phase')!='closed':
     for key in ['pidIdentity','workerIdentity']:
      old=previous.get(key)
      if old:
       current=identity(old['pid'])
       if current and current['boot']==old['boot']:
        if current!=old:raise ValueError('OWNER_IDENTITY')
        raise ValueError('OWNER_ALIVE')
     if not self.recover:raise ValueError('RECOVERY_REQUIRED')
   self.record={'generationId':self.generation,'projectId':self.config['projectId'],'stateIdentity':state_id,'configSha256':config_hash,'phase':'starting','pidIdentity':identity(),'workerIdentity':None}
   self.persist(self.record);atomic(self.config_path,self.config)
   self.log=open(self.root/('lifecycle-'+self.generation+'.log'),'ab',buffering=0)
   self.worker=subprocess.Popen(self.worker_command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,bufsize=0,start_new_session=True,close_fds=True)
   self.record['workerIdentity']=identity(self.worker.pid);self.persist(self.record)
   ready=self._line(time.monotonic()+20);health=ready.get('health',{})
   if not ready.get('ready') or health.get('projectId')!=self.config['projectId'] or health.get('catalogSha256')!=self.config['expectedCatalogSha256']:raise ValueError('HANDSHAKE_BINDING')
   self.health=health;self._serve();self.record['phase']='running';self.persist(self.record)
   with self.lock:self.fenced=False
   def watch():
    self.worker.wait();self.fence()
   threading.Thread(target=watch,daemon=True).start()
   return {'endpoint':'http://127.0.0.1:'+str(self.server.server_address[1]),'token':self.token,'generationId':self.generation,'challenge':self.challenge,'projectId':self.config['projectId'],'catalogSha256':health['catalogSha256'],'stateIdentity':state_id,'protocol':'sep-eval-lifecycle-v1'}
  except Exception:
   if self.record:self.close()
   else:os.close(self.lease);self.lease=None
   raise
 def _serve(self):
  owner=self
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def setup(self):super().setup();self.connection.settimeout(3)
   def answer(self,code,value):
    raw=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.send_header('Connection','close');self.end_headers()
    try:self.wfile.write(raw)
    except (OSError,TimeoutError):pass
   def dispatch(self,post=False):
    if not hmac.compare_digest(self.headers.get('X-API-Key',''),owner.token) or not hmac.compare_digest(self.headers.get('X-SEP-Generation',''),owner.generation):return self.answer(403,{'error':'STALE_CONNECTION'})
    with owner.lock:
     rejected='ENTRY_CLOSED' if owner.fenced else 'ENTRY_BUSY' if owner.inflight>=4 else None
     if not rejected:owner.accepted+=1;owner.inflight+=1
    if rejected:return self.answer(409,{'error':rejected})
    try:
     body=None
     if post:
      n=int(self.headers.get('Content-Length','0'))
      if not 0<n<=50000 or self.headers.get('Transfer-Encoding'):raise ValueError('INPUT')
      body=json.loads(self.rfile.read(n))
     op=self.path[1:]
     if op not in (['submit','status','cancel','result','register'] if post else ['health']):raise ValueError('ROUTE')
     # Recheck after reading the request: a partial body must not dispatch after fencing.
     with owner.lock:
      if owner.fenced:raise ValueError('ENTRY_CLOSED')
     value=owner.rpc(op,body,business=True)
     with owner.lock:
      if owner.fenced:raise ValueError('ENTRY_CLOSED')
     if op=='health':value={**value,'generationId':owner.generation,'protocol':'sep-eval-lifecycle-v1','stateIdentity':owner.record['stateIdentity']}
     self.answer(200,value)
    except ValueError as e:self.answer(409,{'error':str(e) if re.fullmatch('[A-Z_]+',str(e)) else 'INPUT'})
    except Exception:self.answer(503,{'error':'EXECUTION_UNCERTAIN'})
    finally:
     with owner.lock:owner.inflight-=1;owner.lock.notify_all()
   def do_GET(self):self.dispatch()
   def do_POST(self):self.dispatch(True)
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.server.daemon_threads=True
  self.thread=threading.Thread(target=lambda:self.server.serve_forever(poll_interval=.02),daemon=True);self.thread.start()
 def fence(self):
  with self.lock:self.fenced=True;return {'accepted':self.accepted,'inflight':self.inflight}
 def close(self):
  with self.close_lock:
   if self.response is not None:return self.response
   if self.lease is None:return {'status':'blocked','quiescent':False,'reasons':['NOT_OWNER']}
   start=time.monotonic();drain,natural,cancel,total=[start+x for x in self.budgets];boundary=self.fence();reasons=[];summary=None
   try:self.record['phase']='closing';self.persist(self.record)
   except Exception:reasons.append('PERSIST')
   with self.lock:
    while self.inflight and time.monotonic()<drain:self.lock.wait(max(0,drain-time.monotonic()))
    if self.inflight:reasons.append('HTTP_UNCONFIRMED')
   if not reasons and self.worker and self.worker.poll() is None:
    try:summary=self.rpc('shutdown',{'naturalUntil':natural},cancel)
    except Exception:reasons.append('SHUTDOWN_UNCONFIRMED')
   if self.worker:
    if self.worker.poll() is None:
     if reasons:self.worker.kill()
     try:self.worker.wait(timeout=max(.001,cancel-time.monotonic()))
     except subprocess.TimeoutExpired:
      reasons.append('WORKER_EXIT_UNCONFIRMED');self.worker.kill()
      try:self.worker.wait(timeout=max(.001,total-time.monotonic()))
      except subprocess.TimeoutExpired:reasons.append('WORKER_ALIVE')
    if self.worker.poll() is None:reasons.append('WORKER_ALIVE')
   if self.server:
    self.server.shutdown();self.server.server_close();self.thread.join(max(0,total-time.monotonic()))
   with self.lock:
    if self.inflight:reasons.append('HTTP_UNCONFIRMED')
   quiescent=not reasons and summary is not None and summary.get('quiescent') is True
   if not quiescent and not reasons:reasons.append('RESOURCES_UNCONFIRMED')
   self.response={'status':'pass' if quiescent else 'blocked','quiescent':quiescent,'reasons':sorted(set(reasons)),'generationId':self.generation,'boundary':boundary,'workerSummary':summary,'elapsedSeconds':time.monotonic()-start}
   self.record['phase']='closed' if quiescent else 'blocked';self.record['closeResult']=self.response
   try:self.persist(self.record)
   except Exception:self.response.update(status='blocked',quiescent=False);self.response['reasons']=sorted(set(self.response['reasons']+['PERSIST']))
   if self.worker and self.worker.poll() is None:return self.response
   if self.log:self.log.close()
   if self.worker:
    self.worker.stdin.close();self.worker.stdout.close()
   os.close(self.lease);self.lease=None
   return self.response

if __name__=='__main__':
 config_path=Path(sys.argv[1]);raw=config_path.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=sys.argv[2]:raise ValueError('CONFIG_HASH')
 manifest=json.loads(Path(__file__).with_name('lifecycle-manifest.json').read_text())
 for name,expected in manifest.items():
  if Path(name).name!=name or hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()!=expected:raise ValueError('PACKAGE_HASH')
 g=Guardian(json.loads(raw),sys.argv[3],recover='--recover' in sys.argv[4:])
 try:
  print(json.dumps({'ready':g.start()}),flush=True)
  # The private parent pipe is the only shutdown authority. EOF also fences.
  sys.stdin.readline()
 finally:print(json.dumps({'closed':g.close()}),flush=True)
