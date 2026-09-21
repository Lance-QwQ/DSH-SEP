"""Disposable trusted grading process; only the container executes patch code."""
import os,sys,ctypes,signal,resource,json,hashlib
from pathlib import Path

def main():
 expected_parent=int(sys.argv[3]);ctypes.CDLL(None).prctl(1,signal.SIGKILL)
 if os.getppid()!=expected_parent:raise RuntimeError('PARENT_GONE')
 resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
 resource.setrlimit(resource.RLIMIT_FSIZE,(16*1024*1024,16*1024*1024))
 # Numerical libraries otherwise reserve one worker stack per host CPU during
 # import, exhausting the deliberately bounded grader address space.
 for key in ['OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS']:
  os.environ[key]='1'
 from official import load_inputs,COMMANDS,catalog_binding,digest
 from admission import read_admitted
 from supervisor import Supervisor
 from swebench.harness import run_evaluation as grading
 config=json.loads(Path(sys.argv[1]).read_text());job=sys.argv[2];snapshot,row,artifacts=load_inputs(config)
 m=Supervisor(config['state'],config['image'],COMMANDS,official=True)
 try:
  with m._lock():
   r=m._load(job,config['projectId']);binding=r['artifactBinding']
   catalog_sha=digest(catalog_binding(config,artifacts))
   artifacts.update(read_admitted(m.root,snapshot,config['projectId'],catalog_sha,config['snapshotSha256']))
   artifact=artifacts[binding['artifactId']]
   if binding['catalogSha256']!=catalog_sha or binding['snapshotSha256']!=config['snapshotSha256']:raise ValueError('WORKER_BINDING')
   if artifact['patchSha256']!=binding['patchSha256'] or r['phase']!='running':raise ValueError('WORKER_BINDING')
   c=m._owned(r)
   if not c:raise ValueError('CONTAINER_GONE')
  work=m.root/(job+'-grading');work.mkdir(mode=0o700);os.chdir(work)
  class StartedContainer:
   def start(self):return None
   def __getattr__(self,name):return getattr(c,name)
  def owned_container(spec,client,run_id,logger):
   if spec.instance_id!=row['instance_id'] or run_id!=job or spec.image!=row['image']:raise ValueError('OFFICIAL_SCOPE')
   return StartedContainer()
  # Isolated worker-local hooks replace only container ownership/lifecycle.
  grading.create_container=owned_container
  grading.cleanup_container=lambda *args,**kwargs:None
  prediction={'instance_id':row['instance_id'],'model_name_or_path':'sep-bound-artifact','model_patch':artifact['patch']}
  result=grading.run_instance(grading.make_test_spec(row),prediction,m.client,job,timeout=120)
  if not result or result[0]!=row['instance_id'] or type(result[1][row['instance_id']]['resolved']) is not bool:raise ValueError('OFFICIAL_REPORT_MISSING')
  report=work/'logs/evaluation'/job/'sep-bound-artifact'/row['instance_id']/'report.json'
  proof={'artifactBinding':binding,'resolved':result[1][row['instance_id']]['resolved'],'reportPath':str(report),'officialReportSha256':hashlib.sha256(report.read_bytes()).hexdigest()}
  with m._lock():
   current=m._load(job,config['projectId'])
   if current['phase']!='running':return
   m._write(m.root/(job+'-grade.json'),proof)
   m._retire(current,'completed',0)
 except Exception:
  with m._lock():
   r=m._load(job,config['projectId'])
   if r['phase']!='terminal':m._retire(r,'unknown')
  raise
 finally:m.close()

if __name__=='__main__':main()
