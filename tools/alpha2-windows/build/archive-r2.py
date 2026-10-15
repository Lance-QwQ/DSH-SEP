"""Create immutable repair ZIPs from exact manifest bytes; preserves r1 ZIPs."""
import hashlib,json,os,stat,sys,zipfile
from pathlib import Path
root=Path(sys.argv[1]).resolve()
if str(root).lower()!=r'D:\AIData\ProjectWork\DSH\alpha2-windows-packages-20261015-r1\repaired-r2'.lower():raise ValueError('OUTPUT_SCOPE')
def io(p):
    return Path('\\\\?\\'+str(p)) if os.name=='nt' else p
out=root/'artifacts';out.mkdir()
rows=[]
for kind,label in [('full','Full'),('sep','Only')]:
    bundle=root/('bundle-'+kind);manifest=json.loads((bundle/'manifest.json').read_text('utf8'))
    if manifest['revision']!='windows-package.2' or manifest['kind']!=kind:raise ValueError('MANIFEST_BINDING')
    records=[dict(r,path='payload/'+r['path']) for r in manifest['payload']]+manifest['support']+[manifest['graph'],manifest['descriptor']]
    b=(bundle/'manifest.json').read_bytes();records.append(dict(path='manifest.json',size=len(b),sha256=hashlib.sha256(b).hexdigest()))
    if len({r['path'].casefold() for r in records})!=len(records):raise ValueError('DUPLICATE')
    path=out/f'DSH-SEP-{label}-Windows-x64-Alpha2-windows-package.2.zip'
    with zipfile.ZipFile(path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for r in sorted(records,key=lambda r:r['path']):
            if not r['path'] or any(p in ('','..','.') for p in r['path'].split('/')) or any(c in r['path'] for c in '\\:'):raise ValueError('SOURCE_PATH')
            p=io(bundle/r['path']);s=p.lstat()
            if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or p.resolve()!=p or s.st_size!=r['size']:raise ValueError('SOURCE_IDENTITY')
            h=hashlib.sha256();info=zipfile.ZipInfo(r['path'],date_time=(2026,10,15,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o644)<<16
            with p.open('rb') as src,z.open(info,'w',force_zip64=True) as dst:
                while chunk:=src.read(1024*1024):h.update(chunk);dst.write(chunk)
                after=p.lstat()
                if h.hexdigest()!=r['sha256'] or (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise ValueError('SOURCE_CHANGED')
    h=hashlib.sha256()
    with path.open('rb') as f:
        while chunk:=f.read(1024*1024):h.update(chunk)
    row=dict(kind=kind,path=str(path),size=path.stat().st_size,sha256=h.hexdigest(),members=len(records));rows.append(row);print(json.dumps(row),flush=True)
with (root/'ARCHIVES.json').open('x',encoding='utf8') as f:json.dump(dict(schema=1,status='pass',revision='windows-package.2',archives=rows),f,indent=2);f.write('\n')
