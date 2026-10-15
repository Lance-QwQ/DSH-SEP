"""Single trusted backend process; only its containers execute patch code."""
import os,sys,json,re,ctypes,signal,resource,time,subprocess
from pathlib import Path
ctypes.CDLL(None).prctl(1,signal.SIGKILL)
if os.getppid()!=int(sys.argv[2]):raise RuntimeError('PARENT_GONE')
resource.setrlimit(resource.RLIMIT_FSIZE,(16*1024*1024,16*1024*1024))
for key in ['OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS']:os.environ[key]='1'
from official import Official
config=json.loads(Path(sys.argv[1]).read_text());ev=Official(config)
def health():return {'projectId':ev.project,'catalogSha256':ev.catalog_sha,'assessments':list(ev.catalog),'evaluator':'swebench-official-v1','artifacts':ev.public_artifacts(),'snapshotSha256':config['snapshotSha256'],'admission':'exact-edits-v1'}
def active():
 records=[ev.manager._load(p.stem,ev.project) for p in ev.manager.jobs.glob('*.json')]
 return [r for r in records if r['phase']!='terminal']
def shutdown(body):
 cancelled=[];unknown=[]
 while time.monotonic()<body['naturalUntil']:
  rows=active()
  if not rows:break
  for r in rows:ev.status(r['jobId'])
  time.sleep(min(.1,max(0,body['naturalUntil']-time.monotonic())))
 for r in active():
  final=ev.cancel(r['jobId'])
  if final['outcome']=='cancelled':cancelled.append(r['jobId'])
 for p in ev.manager.jobs.glob('*.json'):
  r=ev.result(p.stem)
  if r.get('outcome')=='unknown':unknown.append(p.stem)
 rows=[ev.manager._load(p.stem,ev.project) for p in ev.manager.jobs.glob('*.json')]
 left=ev.manager.client.containers.list(all=True,filters={'label':'dsh.sep.owner='+ev.manager.owner})
 units=[r['deadlineUnit']+suffix for r in rows if r.get('deadlineUnit') for suffix in ['.timer','.service'] if subprocess.run(['systemctl','is-active','--quiet',r['deadlineUnit']+suffix],timeout=2).returncode==0]
 ev.shutdown()
 return {'quiescent':not left and not units and all(r['phase']=='terminal' for r in rows),'cancelled':cancelled,'unknown':unknown,'remainingContainers':len(left),'activeUnits':units}
try:
 print(json.dumps({'ready':True,'health':health()}),flush=True)
 for line in sys.stdin:
  if len(line)>51000:raise ValueError('INPUT_LIMIT')
  request=json.loads(line);op=request['op'];body=request.get('body');done=False
  try:
   if op=='health':value=health()
   elif op=='shutdown':value=shutdown(body);done=True
   else:
    keys={'snapshotSha256','answer'} if op=='register' else {'jobId','assessmentId','artifactId'} if op=='submit' else {'jobId'}
    if op not in ['register','submit','status','result','cancel'] or not isinstance(body,dict) or set(body)!=keys:raise ValueError('INPUT')
    if op!='register' and (not isinstance(body['jobId'],str) or not re.fullmatch('[A-Za-z0-9_-]{1,64}',body['jobId'])):raise ValueError('JOB_ID')
    if op=='register':value=ev.register(body['snapshotSha256'],body['answer'])
    elif op=='submit':value=ev.submit(body['jobId'],body['assessmentId'],body['artifactId'])
    else:value=getattr(ev,op)(body['jobId'])
   response={'id':request['id'],'value':value}
  except ValueError as exc:response={'id':request['id'],'error':str(exc) if re.fullmatch('[A-Z_]+',str(exc)) else 'INPUT'}
  except Exception:response={'id':request['id'],'error':'EXECUTION_UNCERTAIN'}
  print(json.dumps(response),flush=True)
  if done:break
finally:
 ev.shutdown()
