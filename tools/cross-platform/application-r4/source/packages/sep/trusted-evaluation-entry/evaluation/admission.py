"""Content-addressed public patch admission. No model code runs in this process."""
import os,json,re,hashlib,stat
from pathlib import Path
from compile_patch import compile_patch

def compile_answer(answer,files):
 if not isinstance(answer,dict) or len(json.dumps(answer).encode())>48000:raise ValueError('ADMISSION_INPUT')
 try:patch=compile_patch(answer,files)
 except (TypeError,KeyError,AttributeError,SyntaxError):raise ValueError('ADMISSION_INPUT')
 if len(patch.encode())>48000:raise ValueError('ADMISSION_INPUT')
 sha=hashlib.sha256(patch.encode()).hexdigest()
 return {'artifactId':sha,'patchSha256':sha,'patch':patch}

def read_admitted(root,snapshot,project,catalog_sha,snapshot_sha):
 folder=Path(root)/'admitted'
 if not folder.exists():return {}
 if folder.is_symlink() or not folder.is_dir() or folder.stat().st_mode&0o077:raise ValueError('ADMISSION_PATH')
 paths=list(folder.iterdir())
 # Incomplete atomic-write temporaries are never admitted.
 records=[p for p in paths if p.suffix=='.json']
 if len(paths)>64 or len(records)>16:raise ValueError('ADMISSION_LIMIT')
 result={}
 for p in records:
  if not re.fullmatch(r'[a-f0-9]{64}\.json',p.name):raise ValueError('ADMISSION_RECORD')
  try:
   fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
   with os.fdopen(fd,'rb') as f:
    s=os.fstat(f.fileno())
    if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>65536:raise ValueError('ADMISSION_RECORD')
    r=json.loads(f.read(65537))
   if not isinstance(r,dict) or set(r)!={'projectId','snapshotSha256','catalogSha256','artifactId','patchSha256','answer'}:raise ValueError('ADMISSION_RECORD')
   if r['projectId']!=project or r['catalogSha256']!=catalog_sha or r['snapshotSha256']!=snapshot_sha:raise ValueError('ADMISSION_BINDING')
   a=compile_answer(r['answer'],snapshot['files'])
   if a['artifactId']!=p.stem or a['patchSha256']!=r['patchSha256'] or r['artifactId']!=p.stem:raise ValueError('ADMISSION_HASH')
   result[p.stem]=a
  except (OSError,TypeError,KeyError,AttributeError,json.JSONDecodeError):raise ValueError('ADMISSION_RECORD')
 return result
