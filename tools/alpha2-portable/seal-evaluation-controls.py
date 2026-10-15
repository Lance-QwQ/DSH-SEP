"""Only new PUBLIC fixed-instance evidence; no historical state or private data."""
import sys,json,hashlib,shutil
from pathlib import Path
import docker
root=Path('/opt/dsh-sep-eval/linux-finalization-controls-r6');out=Path('/opt/dsh-sep-eval/linux-finalization-evidence-r36');out.mkdir(mode=0o700)
result=json.loads((root/'RESULT.json').read_text());assert result['status']=='pass' and result['providerCalls']==0 and len(result['rows'])==4
inputs=json.loads((root/'INPUTS.json').read_text());sys.path.insert(0,str(Path(inputs['config']['backend']['entry']).parent))
from evaluation import digest
saved=[]
def save(source,name):
 data=source.read_bytes();target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);saved.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
for n in ['RESULT.json','INPUTS.json','snapshot.json','config.json']:save(root/n,n)
client=docker.DockerClient(base_url='unix:///var/run/docker.sock');containers=[]
try:
 for row in result['rows']:
  receipt=row['receipt'];job=receipt['jobId'];grade=json.loads((root/'state'/f'{job}-grade.json').read_text());stored=json.loads((root/'state'/f'{job}-receipt.json').read_text());assert stored==receipt
  assert digest({k:v for k,v in receipt.items() if k!='receiptSha256'})==receipt['receiptSha256']
  report=Path(grade['reportPath']);assert report.is_relative_to(root/'state')
  assert hashlib.sha256(report.read_bytes()).hexdigest()==grade['officialReportSha256']==receipt['officialReportSha256']
  assert grade['resolved']==(row['artifactId']=='positive')==receipt['resolved']
  record=json.loads((root/'state/jobs'/f'{job}.json').read_text());assert record['phase']=='terminal'
  try:client.containers.get(record['containerId']);raise AssertionError('OWNED_CONTAINER_REMAINS')
  except docker.errors.NotFound:containers.append({'jobId':job,'containerId':record['containerId'],'state':'absent'})
  save(root/'state'/f'{job}-grade.json',f'jobs/{job}/grade.json');save(root/'state'/f'{job}-receipt.json',f'jobs/{job}/receipt.json');save(root/'state/jobs'/f'{job}.json',f'jobs/{job}/job.json');save(report,f'jobs/{job}/official-report.json')
finally:client.close()
driver=Path('/opt/dsh-sep-eval/linux-finalization-controls-driver-r6')
for n in ['prepare-evaluation-controls.py','exercise-evaluation-controls.mjs','linux-evaluation.mjs','linux-evaluation-paths.mjs','linux-consumers.mjs','sep-fixture.mjs','linux-sep-runtime.mjs','host-modules.mjs','bundle-modules.mjs']:save(driver/n,'controller-source/'+n)
(out/'AUDIT.json').write_text(json.dumps({'status':'pass','scope':result['scope'],'rows':4,'containers':containers,'saved':saved,'notClaimed':['online-model-solving','final-delivery-archive-desktop-same-run','arbitrary-instances','ordinary-non-root-Docker-setup']},indent=2)+'\n')
print(json.dumps({'status':'pass','reports':4,'containers':containers,'out':str(out)}))
