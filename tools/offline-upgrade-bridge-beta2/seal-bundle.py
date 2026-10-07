from pathlib import Path
import json,hashlib,os
r=Path(__file__).resolve().parent;rows=[]
for current,dirs,files in os.walk(r,followlinks=False):
 dirs[:]=[n for n in dirs if n not in ['node_modules','__pycache__'] and not (Path(current)==r and n=='tests') and not Path(current,n).is_symlink() and not Path(current,n).is_junction()]
 for n in files:
  p=Path(current,n);rel=p.relative_to(r).as_posix()
  if rel in ['BUNDLE-MANIFEST.json','bundle-id.mjs'] or rel.endswith('.log') or rel.startswith('review/'):continue
  if p.is_symlink():raise RuntimeError('BUNDLE_ALIAS')
  raw=p.read_bytes();rows.append({'path':rel,'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
raw=(json.dumps({'schema':1,'kind':'sep-offline-upgrade-bridge','sepVersion':'0.2.1-beta.2','hostVersion':'0.2.0-rc.2','files':sorted(rows,key=lambda x:x['path'])},indent=2)+'\n').encode()
(r/'BUNDLE-MANIFEST.json').write_bytes(raw);h=hashlib.sha256(raw).hexdigest();(r/'bundle-id.mjs').write_bytes(("export const MANIFEST_SHA256='"+h+"';\n").encode());print(json.dumps({'files':len(rows),'manifestSha256':h}))
