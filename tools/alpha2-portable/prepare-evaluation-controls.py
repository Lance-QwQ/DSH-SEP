"""New public Flask controls; original fixed snapshot/config are never modified."""
import sys,json,hashlib
from pathlib import Path
root=Path(sys.argv[1]);root.mkdir(mode=0o700)
bundle=Path(sys.argv[2]);entry=bundle/'bundle/modules/trusted-evaluation-entry/evaluation/lifecycle.py'
base=Path('/opt/dsh-sep-eval/second-instance-20260917/config.json')
config=json.loads(base.read_text());old=Path(config['snapshot']).read_bytes()
assert hashlib.sha256(old).hexdigest()==config['snapshotSha256']
snapshot=json.loads(old);assert snapshot['visibility']=='public'
dataset=Path(config['dataset']).read_bytes();assert hashlib.sha256(dataset).hexdigest()==config['datasetSha256']
gold=json.loads(dataset)[0]['patch'];assert snapshot['task']['instance_id']=='pallets__flask-5014'
assert '+        if not name:\n+            raise ValueError("\'name\' may not be empty.")\n' in gold
before='        if "." in name:\n'
after='        if not name:\n            raise ValueError("\'name\' may not be empty.")\n\n'+before
assert snapshot['files']['src/flask/blueprints.py'].count(before)==1
snapshot['answers']['positive']={'edits':[{'path':'src/flask/blueprints.py','old':before,'new':after}]}
public=root/'snapshot.json';public.write_text(json.dumps(snapshot)+'\n');public.chmod(0o600)
config['snapshot']=str(public);config['snapshotSha256']=hashlib.sha256(public.read_bytes()).hexdigest()
sys.path.insert(0,str(entry.parent))
from official import load_inputs,catalog_binding
from evaluation import digest
_,_,artifacts=load_inputs(config);config['expectedCatalogSha256']=digest(catalog_binding(config,artifacts))
state=root/'state';state.mkdir(mode=0o700);config['state']=str(state)
path=root/'config.json';path.write_text(json.dumps(config)+'\n');path.chmod(0o600)
s=state.stat();python=Path('/opt/dsh-sep-eval/swebench-venv/bin/python')
proof={'config':{'enabled':True,'projectId':config['projectId'],'catalogSha256':config['expectedCatalogSha256'],'shutdownMs':30000,'backend':{'entry':str(entry),'configPath':str(path),'configSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'stateIdentity':hashlib.sha256(f'{state}:{s.st_dev}:{s.st_ino}'.encode()).hexdigest()}},'runtime':{'python':str(python),'pythonSha256':hashlib.sha256(python.read_bytes()).hexdigest()},'inputBinding':{'originalSnapshotSha256':hashlib.sha256(old).hexdigest(),'snapshotSha256':config['snapshotSha256'],'datasetSha256':config['datasetSha256'],'goldPatchSha256':hashlib.sha256(gold.encode()).hexdigest(),'modelGenerated':False}}
(root/'INPUTS.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'status':'pass','scope':'new fixed public Flask gold-derived positive and historical negative','root':str(root)}))
