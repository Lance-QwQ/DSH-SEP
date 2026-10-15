"""Read fixed downloaded Actions ZIPs without extracting member paths.
Outer/membership/each member and final reconstruction are independently pinned.
Only operator-named outputs are written; never any member-supplied path.
"""
import hashlib,json,os,re,stat,sys,zipfile
from pathlib import Path,PurePosixPath
CHUNK=1024*1024
HEX=re.compile(r'[a-f0-9]{64}\Z')
def require(ok):
 if not ok: raise ValueError('SEP_NATIVE_INSTALLER_TRANSPORT')
def sha(data):return hashlib.sha256(data).hexdigest()
def relative(p):return isinstance(p,str) and len(p)<2048 and p==str(PurePosixPath(p)) and not p.startswith('/') and not re.search(r'[\\:\x00-\x20\x7f]',p) and all(v not in ('','.','..') for v in p.split('/'))
def positive(x,limit=2*1024**3):return type(x) is int and 0<x<=limit
def identity(st):return (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
def regular(path):
 s=path.lstat();require(stat.S_ISREG(s.st_mode) and not path.is_symlink() and s.st_nlink==1 and path.resolve()==path);return s

def verify_download(stage,artifacts,download_root,output):
 output=Path(output).absolute();download_root=Path(download_root).absolute();require(output.resolve()==output and output.is_dir() and download_root.resolve()==download_root)
 require(stage.get('status')=='ready' and artifacts.get('status')=='ready' and artifacts.get('sourceCommit')==stage['commit'])
 require(re.fullmatch(r'[a-f0-9]{40}',stage['commit']) and stage['artifact'] in ('DSH-SEP-macOS-Alpha2-project-preview.zip','DSH-SEP-macOS-Alpha2-installer-preview.zip') and positive(stage['archiveBytes']) and HEX.fullmatch(stage['archiveSha256']))
 rows=artifacts['artifacts'];require(type(rows) is list and 1<=len(rows)<=16 and len({r['id'] for r in rows})==len(rows))
 targets={'RESULT.json':(stage['assemblyBytes'],stage['assemblySha256']),'PACKAGE-INVENTORY.json':(stage['inventoryBytes'],stage['inventorySha256'])}
 for proof in stage.get('verification',[]):
  require(relative(proof['name']) and '/' not in proof['name'] and proof['name'] not in targets);targets[proof['name']]=(proof['bytes'],proof['sha256'])
 require(all(positive(n) and HEX.fullmatch(h) for n,h in targets.values()))
 parts=artifacts['parts'];require(type(parts) is list and 1<=len(parts)<=16 and sum(p['bytes'] for p in parts)==stage['archiveBytes'])
 opened=[];selected={};identities=[];expanded=0
 try:
  for row in rows:
   require(positive(row['id'],10**15) and positive(row['bytes']) and HEX.fullmatch(row['sha256']) and type(row['members']) is list and len(row['members'])<=100000)
   path=download_root/(str(row['id'])+'.zip');before=regular(path);require(before.st_size==row['bytes']);handle=os.fdopen(os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0)),'rb');opened.append(handle);fd_before=os.fstat(handle.fileno());require((before.st_dev,before.st_ino,before.st_size)==(fd_before.st_dev,fd_before.st_ino,fd_before.st_size))
   h=hashlib.sha256()
   for b in iter(lambda:handle.read(CHUNK),b''):h.update(b)
   require(h.hexdigest()==row['sha256']);handle.seek(0);archive=zipfile.ZipFile(handle);opened.append(archive);infos=archive.infolist();require(len(infos)==len(row['members']) and len({i.filename for i in infos})==len(infos))
   expected={m['path']:m for m in row['members']};require(len(expected)==len(row['members']) and set(expected)=={i.filename for i in infos})
   for info in infos:
    m=expected[info.filename];require(relative(info.filename) and not info.is_dir() and not(info.flag_bits&1) and type(m['bytes']) is int and 0<=m['bytes']<=2*1024**3 and info.file_size==m['bytes'] and HEX.fullmatch(m['sha256']))
    expanded+=m['bytes'];require(expanded<=4*1024**3)
    mode=(info.external_attr>>16)&0o170000;require(mode in (0,stat.S_IFREG));h=hashlib.sha256();n=0
    with archive.open(info) as f:
     for b in iter(lambda:f.read(CHUNK),b''):n+=len(b);require(n<=m['bytes']);h.update(b)
    require(n==m['bytes'] and h.hexdigest()==m['sha256']);selected[(row['id'],info.filename)]=(archive,info,m)
   identities.append((path,handle,identity(before),identity(fd_before)))
  writes=artifacts['outputs'];require(type(writes) is list and len(writes)==len(targets) and {x['name'] for x in writes}==set(targets))
  for row in writes:
   archive,info,m=selected[(row['artifactId'],row['member'])];require((m['bytes'],m['sha256'])==targets[row['name']]);require(not(output/row['name']).exists())
  require(not(output/stage['artifact']).exists())
  for index,p in enumerate(parts,1):
   require(p['index']==index and positive(p['bytes']) and HEX.fullmatch(p['sha256']));archive,info,m=selected[(p['artifactId'],p['member'])];require((m['bytes'],m['sha256'])==(p['bytes'],p['sha256']))
  # Preflight completed without extracting. Only fixed output names follow.
  for row in writes:
   archive,info,m=selected[(row['artifactId'],row['member'])]
   with archive.open(info) as src,(output/row['name']).open('xb') as dest:
    for b in iter(lambda:src.read(CHUNK),b''):dest.write(b)
    dest.flush();os.fsync(dest.fileno())
  whole=hashlib.sha256();total=0
  with (output/stage['artifact']).open('xb') as dest:
   for index,p in enumerate(parts,1):
    require(p['index']==index);archive,info,m=selected[(p['artifactId'],p['member'])];require((m['bytes'],m['sha256'])==(p['bytes'],p['sha256']))
    with archive.open(info) as src:
     for b in iter(lambda:src.read(CHUNK),b''):total+=len(b);require(total<=stage['archiveBytes']);whole.update(b);dest.write(b)
   dest.flush();os.fsync(dest.fileno())
  require(total==stage['archiveBytes'] and whole.hexdigest()==stage['archiveSha256'])
  for path,handle,before,fd_before in identities:require(identity(regular(path))==before and identity(os.fstat(handle.fileno()))==fd_before)
  for name,(n,want) in {**targets,stage['artifact']:(stage['archiveBytes'],stage['archiveSha256'])}.items():
   path=output/name;require(regular(path).st_size==n);h=hashlib.sha256()
   with path.open('rb') as f:
    for b in iter(lambda:f.read(CHUNK),b''):h.update(b)
   require(h.hexdigest()==want)
  return {'schema':1,'status':'pass','scope':'pinned download transport only; no extraction/signature/installation','archiveSha256':stage['archiveSha256'],'assemblySha256':stage['assemblySha256'],'inventorySha256':stage['inventorySha256'],'artifacts':[x['id'] for x in rows],'parts':len(parts)}
 finally:
  for value in reversed(opened):value.close()
if __name__=='__main__':
 require(len(sys.argv)==4);stage_name,downloads,out=sys.argv[1:];require(stage_name in ('payload','installer'));here=Path(__file__).parent
 pins=json.loads((here/'installer-pins.json').read_bytes());transport=json.loads((here/'installer-transport-pins.json').read_bytes());r=verify_download(pins[stage_name],transport[stage_name],downloads,out)
 with (Path(out)/'DOWNLOAD-VERIFIED.json').open('x',encoding='utf8') as f:json.dump(r,f,indent=2);f.write('\n')
 print(json.dumps({'status':r['status'],'parts':r['parts']}))