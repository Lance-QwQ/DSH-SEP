"""New private state; verified historical PUBLIC snapshot inputs are read only."""
import sys,json,hashlib,os
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(mode=0o700)
base=Path('/opt/dsh-sep-eval/second-instance-20260917/config.json')
config=json.loads(base.read_text())
if not config['snapshot'].startswith('/opt/dsh-sep-eval/') or json.loads(Path(config['snapshot']).read_text()).get('visibility')!='public':raise ValueError('PUBLIC_INPUT_REQUIRED')
entry=Path(sys.argv[2])/'bundle/modules/trusted-evaluation-entry/evaluation/lifecycle.py'
sys.path.insert(0,str(entry.parent))
from official import load_inputs,catalog_binding
from evaluation import digest
_,_,artifacts=load_inputs(config);config['expectedCatalogSha256']=digest(catalog_binding(config,artifacts))
state=out/'state';state.mkdir(mode=0o700);config['state']=str(state)
body=json.dumps(config);path=out/'config.json';path.write_text(body);path.chmod(0o600)
s=state.stat();python=Path('/opt/dsh-sep-eval/swebench-venv/bin/python')
proof={'config':{'enabled':True,'projectId':config['projectId'],'catalogSha256':config['expectedCatalogSha256'],'shutdownMs':30000,'backend':{'entry':str(entry),'configPath':str(path),'configSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'stateIdentity':hashlib.sha256(f'{state}:{s.st_dev}:{s.st_ino}'.encode()).hexdigest()}},'runtime':{'python':str(python),'pythonSha256':hashlib.sha256(python.read_bytes()).hexdigest()},'source':str(out/'source')}
(out/'source').mkdir(mode=0o700)
(out/'INPUTS.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'prepared':str(out),'snapshotSha256':config['snapshotSha256'],'datasetSha256':config['datasetSha256'],'scope':'existing fixed public Flask instance; new state'}))
