"""Public-artifact official grading controller. No arbitrary commands or raw uploads."""
import os,json,re,fcntl,hashlib,subprocess,sys
import importlib.metadata
from pathlib import Path
from supervisor import Supervisor
from compile_patch import compile_patch
from admission import compile_answer,read_admitted
from evaluation import digest,Server

COMMANDS={'official-swebench':['/bin/sleep','300']}

def verified(path,expected,limit):
 p=Path(path)
 if not p.is_absolute() or p.is_symlink():raise ValueError('INPUT_PATH')
 with p.open('rb') as f:
  stat=os.fstat(f.fileno())
  if stat.st_nlink!=1 or stat.st_size>limit:raise ValueError('INPUT_LIMIT')
  raw=f.read(limit+1)
 if len(raw)>limit or hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('SNAPSHOT_HASH')
 return json.loads(raw)

def load_inputs(config):
 runtime=config.get('runtime',{})
 if runtime.get('version')!='5.0.2' or importlib.metadata.version('swebench')!=runtime['version'] or not isinstance(runtime.get('files'),dict) or len(runtime['files'])<3:raise ValueError('RUNTIME_BINDING')
 for path,expected in runtime['files'].items():
  try:actual=hashlib.sha256(Path(path).read_bytes()).hexdigest()
  except OSError:raise ValueError('RUNTIME_BINDING')
  if actual!=expected:raise ValueError('RUNTIME_BINDING')
 snapshot=verified(config['snapshot'],config['snapshotSha256'],3*1024*1024)
 if set(snapshot)!={'visibility','task','files','answers'} or snapshot['visibility']!='public' or set(snapshot['task'])!={'instance_id','repo','base_commit','problem_statement'}:raise ValueError('PUBLIC_SNAPSHOT')
 if not isinstance(snapshot['files'],dict) or not 1<=len(snapshot['files'])<=128:raise ValueError('FILES')
 for path,text in snapshot['files'].items():
  if not isinstance(text,str) or not path.endswith('.py') or any(c in path for c in '\\:\x00\n\r') or any(p in ('','.','..','.git') for p in path.split('/')):raise ValueError('PATH')
 if sum(len(s.encode()) for s in snapshot['files'].values())>2*1024*1024:raise ValueError('FILES_LIMIT')
 rows=verified(config['dataset'],config['datasetSha256'],3*1024*1024)
 if not isinstance(rows,list) or len(rows)!=1:raise ValueError('DATASET_SCOPE')
 row=rows[0]
 for k in ['instance_id','repo','base_commit','problem_statement']:
  if snapshot['task'][k]!=row[k]:raise ValueError('BASELINE_BINDING')
 if row.get('image_assets'):raise ValueError('IMAGE_ASSETS_UNSUPPORTED')
 answers=snapshot['answers']
 if not isinstance(answers,dict) or not 1<=len(answers)<=16:raise ValueError('ARTIFACTS')
 artifacts={}
 for id,answer in answers.items():
  if not re.fullmatch('[A-Za-z0-9_-]{1,64}',id):raise ValueError('ARTIFACT_ID')
  patch=compile_patch(answer,snapshot['files'])
  artifacts[id]={'artifactId':id,'patchSha256':hashlib.sha256(patch.encode()).hexdigest(),'patch':patch}
 return snapshot,row,artifacts

def catalog_binding(config,artifacts):
 return {'projectId':config['projectId'],'image':config['image'],'snapshotSha256':config['snapshotSha256'],'datasetSha256':config['datasetSha256'],'runtime':config['runtime'],'evaluator':'swebench-official-v1','artifacts':{k:v['patchSha256'] for k,v in artifacts.items()},'timeout':180}

class Official:
 def __init__(self,config):
  self.config=dict(config);self.snapshot,self.row,self.artifacts=load_inputs(config)
  self.project=config['projectId'];self.catalog={'official-swebench':{}};self.lease=None;self.children={}
  if not re.fullmatch('[A-Za-z0-9_-]{1,64}',self.project):raise ValueError('PROJECT')
  self.binding=catalog_binding(config,self.artifacts)
  self.catalog_sha=digest(self.binding)
  self.manager=Supervisor(config['state'],config['image'],COMMANDS,official=True)
  try:
   # The official tag must resolve to the already verified local immutable image.
   if self.manager.client.images.get(self.row['image']).id!=config['image']:raise ValueError('IMAGE_BINDING')
   with self.manager._lock():
    p=self.manager.root/'official-catalog.json'
    if p.exists():
     if self.manager._read(p)!=self.binding:raise ValueError('CATALOG_BINDING')
    elif list(self.manager.jobs.glob('*.json')):raise ValueError('CATALOG_BINDING')
    else:self.manager._write(p,self.binding)
    fd=os.open(self.manager.root/'service.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:os.close(fd);raise ValueError('SERVICE_BUSY')
    self.lease=fd
    self.manager._write(self.manager.root/'worker-config.json',config)
   self.all_artifacts()
   self.manager.recover()
  except Exception:self.close();raise
 def close(self):
  self.manager.close()
  if self.lease is not None:os.close(self.lease);self.lease=None
 def shutdown(self):
  if self.lease is None:return
  self.manager.recover()
  for p in self.children.values():
   if p.poll() is None:p.kill()
   p.wait(timeout=10)
  self.children.clear();self.close()
 def all_artifacts(self):
  return {**self.artifacts,**read_admitted(self.manager.root,self.snapshot,self.project,self.catalog_sha,self.config['snapshotSha256'])}
 def register(self,snapshotSha256,answer):
  if snapshotSha256!=self.config['snapshotSha256']:raise ValueError('SNAPSHOT_BINDING')
  # Recheck original source bytes before compiling new input.
  verified(self.config['snapshot'],snapshotSha256,3*1024*1024)
  a=compile_answer(answer,self.snapshot['files'])
  with self.manager._lock():
   current=self.all_artifacts();folder=self.manager.root/'admitted'
   if a['artifactId'] not in current:
    if len(current)-len(self.artifacts)>=16:raise ValueError('ADMISSION_LIMIT')
    folder.mkdir(mode=0o700,exist_ok=True)
    self.manager._write(folder/(a['artifactId']+'.json'),{'projectId':self.project,'snapshotSha256':snapshotSha256,'catalogSha256':self.catalog_sha,'artifactId':a['artifactId'],'patchSha256':a['patchSha256'],'answer':answer})
  return {'projectId':self.project,**self.artifact_binding(a['artifactId']),'status':'pass','scope':'public_patch_registered_not_graded'}
 def public_artifacts(self):
  return [{'artifactId':k,'patchSha256':v['patchSha256'],'instanceId':self.row['instance_id'],'baseCommit':self.row['base_commit']} for k,v in self.all_artifacts().items()]
 def artifact_binding(self,id):
  artifacts=self.all_artifacts()
  if id not in artifacts:raise ValueError('ARTIFACT')
  return {'artifactId':id,'patchSha256':artifacts[id]['patchSha256'],'snapshotSha256':self.config['snapshotSha256'],'catalogSha256':self.catalog_sha,'instanceId':self.row['instance_id'],'baseCommit':self.row['base_commit']}
 def view(self,r):
  b=r.get('artifactBinding',{})
  if r['projectId']!=self.project or b!=self.artifact_binding(b.get('artifactId')):raise ValueError('RECORD_BINDING')
  return {'jobId':r['jobId'],'projectId':self.project,'assessmentId':'official-swebench','catalogSha256':self.catalog_sha,'image':r['image'],'phase':r['phase'],'deadline':r['deadline'],'createdAt':r['createdAt'],'retiredAt':r.get('retiredAt'),'outcome':r.get('outcome'),'exitCode':r.get('exitCode'),**b}
 def submit(self,job,assessment,artifact):
  if assessment!='official-swebench':raise ValueError('ASSESSMENT')
  binding=self.artifact_binding(artifact)
  exists=self.manager._path(job).exists()
  r=self.manager.submit(self.project,job,assessment,180,binding=binding)
  if exists:return self.view(r)
  try:
   logfile=self.manager.root/(job+'-worker.log')
   with logfile.open('ab') as log:
    p=subprocess.Popen([sys.executable,str(Path(__file__).with_name('grade_worker.py')),str(self.manager.root/'worker-config.json'),job,str(os.getpid())],stdout=log,stderr=log,start_new_session=True,close_fds=True)
   self.children[job]=p
  except Exception:
   with self.manager._lock():self.manager._retire(self.manager._load(job,self.project),'unknown')
   raise
  return self.view(r)
 def status(self,job):
  p=self.children.get(job)
  if p and p.poll() is not None:
   with self.manager._lock():
    r=self.manager._load(job,self.project)
    if r['phase']!='terminal':self.manager._retire(r,'unknown')
   del self.children[job]
  return self.view(self.manager.poll(self.project,job))
 def cancel(self,job):
  r=self.manager.cancel(self.project,job);p=self.children.pop(job,None)
  if p:
   if p.poll() is None:p.kill()
   p.wait(timeout=10)
  return self.view(r)
 def result(self,job):
  r=self.status(job);resolved=None;report_hash=None
  if r['phase']!='terminal':return {**r,'status':'not_run','resolved':None,'evaluator':'swebench-official-v1'}
  status='blocked'
  if r['outcome']=='completed':
   proof=self.manager._read(self.manager.root/(job+'-grade.json'))
   if proof['artifactBinding']!=self.artifact_binding(r['artifactId']) or type(proof['resolved']) is not bool:raise ValueError('GRADE_BINDING')
   report=Path(proof['reportPath'])
   if report.parent!=self.manager.root/(job+'-grading')/'logs/evaluation'/job/'sep-bound-artifact'/self.row['instance_id'] or hashlib.sha256(report.read_bytes()).hexdigest()!=proof['officialReportSha256']:raise ValueError('GRADE_REPORT_HASH')
   resolved=proof['resolved'];report_hash=proof['officialReportSha256'];status='pass' if resolved else 'fail'
  receipt={**r,'status':status,'resolved':resolved,'evaluator':'swebench-official-v1','scope':'bound_public_artifact_official_grading','officialReportSha256':report_hash}
  receipt['receiptSha256']=digest(receipt)
  with self.manager._lock():
   p=self.manager.root/(job+'-receipt.json')
   if p.exists():
    if self.manager._read(p)!=receipt:raise ValueError('RECEIPT_MISMATCH')
   else:self.manager._write(p,receipt)
  return receipt

if __name__=='__main__':
 ev=Official(json.loads(Path(sys.argv[1]).read_text()));server=Server(ev)
 try:print(json.dumps({'endpoint':server.start(),'token':server.token,'catalogSha256':ev.catalog_sha,'projectId':ev.project}),flush=True);sys.stdin.readline()
 finally:server.close();ev.shutdown()
