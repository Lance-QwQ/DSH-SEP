"""Create final ZIPs from manifest-bound regular files; no unlisted member."""
import hashlib,json,os,stat,sys,zipfile
from pathlib import Path
root=Path(sys.argv[1]).resolve()
if str(root).lower()!=r'D:\AIData\ProjectWork\DSH\alpha2-windows-packages-20261015-r1'.lower():raise ValueError('OUTPUT_SCOPE')
out=root/'artifacts';out.mkdir()
rows=[]
for kind,label in [('full','Full'),('sep','Only')]:
    bundle=root/('bundle-'+kind);manifest=json.loads((bundle/'manifest.json').read_text('utf8'))
    records=[dict(r,path='payload/'+r['path']) for r in manifest['payload']]+manifest['support']+[manifest['graph'],manifest['descriptor']]
    b=(bundle/'manifest.json').read_bytes();records.append(dict(path='manifest.json',size=len(b),sha256=hashlib.sha256(b).hexdigest()))
    path=out/f'DSH-SEP-{label}-Windows-x64-Alpha2-windows-package.1.zip'
    with zipfile.ZipFile(path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for r in sorted(records,key=lambda r:r['path']):
            p=bundle/r['path'];s=p.lstat()
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
(root/'ARCHIVES.json').write_text(json.dumps(dict(schema=1,status='pass',archives=rows),indent=2)+'\n',encoding='utf8')
