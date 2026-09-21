"""Trusted fixed-catalog evaluation API. Never accepts commands or Docker options."""
import hashlib,hmac,json,re,secrets,threading,fcntl,os
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
from supervisor import Supervisor

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

class Evaluation:
 def __init__(self,directory,project,image,catalog):
  if not isinstance(project,str) or not re.fullmatch('[A-Za-z0-9_-]{1,128}',project):raise ValueError('PROJECT')
  if not isinstance(catalog,dict) or not 1<=len(catalog)<=32:raise ValueError('CATALOG')
  self.project=project;self.catalog=json.loads(json.dumps(catalog));self.fingerprints={};self.lease=None
  if len(json.dumps(self.catalog).encode())>48000:raise ValueError('CATALOG_LIMIT')
  for key,row in self.catalog.items():
   if not isinstance(row,dict) or set(row)!={'argv','timeout'} or type(row['timeout']) is not int or not 1<=row['timeout']<=300:raise ValueError('CATALOG')
   fingerprint=hashlib.sha256(json.dumps([image,tuple(row['argv']),row['timeout']]).encode()).hexdigest()
   if fingerprint in self.fingerprints:raise ValueError('CATALOG_ALIASES')
   self.fingerprints[fingerprint]=key
  self.binding={'projectId':project,'image':image,'catalog':self.catalog,'evaluator':'fixed-command-v1'}
  self.catalog_sha=digest(self.binding)
  self.manager=Supervisor(directory,image,{k:v['argv'] for k,v in self.catalog.items()})
  try:
   with self.manager._lock():
    p=self.manager.root/'catalog.json'
    if p.exists():
     if self.manager._read(p)!=self.binding:raise ValueError('CATALOG_BINDING')
    else:
     if list(self.manager.jobs.glob('*.json')):raise ValueError('CATALOG_BINDING_MISSING')
     self.manager._write(p,self.binding)
    self.receipts=self.manager.root/'receipts';self.receipts.mkdir(mode=0o700,exist_ok=True)
    if self.receipts.is_symlink():raise ValueError('RECEIPT_PATH')
    fd=os.open(self.manager.root/'service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:os.close(fd);raise ValueError('SERVICE_BUSY')
    self.lease=fd
   # Conservative restart policy: retire unfinished work, never replay it.
   self.manager.recover()
  except Exception:self.close();raise
 def close(self):
  self.manager.close()
  if self.lease is not None:os.close(self.lease);self.lease=None
 def view(self,r):
  if r['projectId']!=self.project or r['fingerprint'] not in self.fingerprints:raise ValueError('CATALOG_RECORD')
  return {'jobId':r['jobId'],'projectId':self.project,'assessmentId':self.fingerprints[r['fingerprint']],
   'catalogSha256':self.catalog_sha,'image':r['image'],'phase':r['phase'],'deadline':r['deadline'],
   'createdAt':r['createdAt'],'retiredAt':r.get('retiredAt'),'outcome':r.get('outcome'),'exitCode':r.get('exitCode')}
 def submit(self,job,assessment):
  if not isinstance(assessment,str) or assessment not in self.catalog:raise ValueError('ASSESSMENT')
  return self.view(self.manager.submit(self.project,job,assessment,self.catalog[assessment]['timeout']))
 def status(self,job):return self.view(self.manager.poll(self.project,job))
 def cancel(self,job):return self.view(self.manager.cancel(self.project,job))
 def result(self,job):
  r=self.status(job)
  if r['phase']!='terminal':return {**r,'status':'not_run','resolved':None,'evaluator':'fixed-command-v1'}
  status=('pass' if r['exitCode']==0 else 'fail') if r['outcome']=='completed' else 'blocked'
  receipt={**r,'status':status,'resolved':None,'evaluator':'fixed-command-v1','scope':'configured_command_exit_only'}
  receipt['receiptSha256']=digest(receipt)
  with self.manager._lock():
   p=self.receipts/(job+'.json')
   if p.exists():
    if self.manager._read(p)!=receipt:raise ValueError('RECEIPT_MISMATCH')
   else:self.manager._write(p,receipt)
  return receipt

class Server:
 def __init__(self,evaluation):self.evaluation=evaluation;self.token=secrets.token_hex(32);self.server=None
 def start(self):
  service=self
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def setup(self):super().setup();self.connection.settimeout(3)
   def answer(self,code,value):
    data=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.send_header('Connection','close');self.end_headers()
    try:self.wfile.write(data)
    except (BrokenPipeError,ConnectionResetError):pass
   def do_GET(self):
    if not hmac.compare_digest(self.headers.get('X-API-Key',''),service.token):return self.answer(403,{'error':'AUTH'})
    if self.path!='/health':return self.answer(404,{'error':'ROUTE'})
    health={'projectId':service.evaluation.project,'catalogSha256':service.evaluation.catalog_sha,'assessments':list(service.evaluation.catalog)}
    try:
     if hasattr(service.evaluation,'public_artifacts'):health.update(evaluator='swebench-official-v1',artifacts=service.evaluation.public_artifacts(),snapshotSha256=service.evaluation.config['snapshotSha256'],admission='exact-edits-v1')
    except Exception:return self.answer(409,{'error':'CATALOG_UNAVAILABLE'})
    self.answer(200,health)
   def do_POST(self):
    if not hmac.compare_digest(self.headers.get('X-API-Key',''),service.token):return self.answer(403,{'error':'AUTH'})
    if self.path not in ['/submit','/status','/cancel','/result','/register']:return self.answer(404,{'error':'ROUTE'})
    try:
     n=int(self.headers.get('Content-Length','0'))
     if not 1<=n<=(50000 if self.path=='/register' else 8192) or self.headers.get('Transfer-Encoding'):raise ValueError('INPUT')
     body=json.loads(self.rfile.read(n))
     if self.path=='/register':
      if not hasattr(service.evaluation,'register') or not isinstance(body,dict) or set(body)!={'snapshotSha256','answer'}:raise ValueError('INPUT')
      return self.answer(200,service.evaluation.register(body['snapshotSha256'],body['answer']))
     keys={'jobId','assessmentId'} if self.path=='/submit' else {'jobId'}
     official=self.path=='/submit' and hasattr(service.evaluation,'public_artifacts')
     if official:keys.add('artifactId')
     if not isinstance(body,dict) or set(body)!=keys or not isinstance(body['jobId'],str) or not re.fullmatch('[A-Za-z0-9_-]{1,64}',body['jobId']):raise ValueError('INPUT')
     fn=getattr(service.evaluation,self.path[1:]);value=fn(body['jobId'],body['assessmentId'],body['artifactId']) if official else fn(body['jobId'],body['assessmentId']) if self.path=='/submit' else fn(body['jobId'])
     self.answer(200,value)
    except ValueError as error:
     code=str(error);self.answer(409,{'error':code if re.fullmatch('[A-Z_]+',code) else 'INPUT'})
    except Exception:self.answer(503,{'error':'EXECUTION_UNCERTAIN','jobId':body.get('jobId') if isinstance(locals().get('body'),dict) else None})
  self.server=HTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
  return 'http://127.0.0.1:'+str(self.server.server_address[1])
 def close(self):
  if self.server:self.server.shutdown();self.server.server_close();self.thread.join(10);self.server=None

if __name__=='__main__':
 import sys
 # Administrator-owned configuration path, never supplied by a model tool call.
 config=json.loads(Path(sys.argv[1]).read_text());ev=Evaluation(config['state'],config['projectId'],config['image'],config['catalog']);server=Server(ev)
 try:
  print(json.dumps({'endpoint':server.start(),'token':server.token,'catalogSha256':ev.catalog_sha,'projectId':ev.project}),flush=True)
  sys.stdin.readline()
 finally:
  server.close();ev.manager.recover();ev.close()
