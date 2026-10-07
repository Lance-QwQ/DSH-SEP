"""Create a byte-deterministic ZIP from a verified base and bounded replacements.
Unchanged compressed members are copied verbatim; new members use ZIP_STORED.
Only seekable, unencrypted archives without data descriptors are supported.
"""
from pathlib import Path
import copy,hashlib,re,struct,zipfile
DATE=(2026,10,7,0,0,0)
MAX_ARCHIVE=2*1024**3
MAX_REPLACEMENTS=128*1024**2
def safe(name):
 if not isinstance(name,str) or not name or name.endswith('/') or '\\' in name or re.search(r'[<>:"|?*\x00-\x1f]',name):return False
 parts=name.split('/')
 if any(not x or x in ('.','..') or x.endswith(('.', ' ')) for x in parts):return False
 if any(x.lower() in ('.git','.codex','local-secrets') for x in parts):return False
 last=parts[-1].lower()
 return not (last=='.env' or last.startswith('.env.') and not last.endswith(('.example','.sample','.template')))
def sha(path):
 with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def rewrite(base,destination,replacements,removed,expected_base_sha256):
 base=Path(base);destination=Path(destination)
 if destination.exists():raise FileExistsError(destination)
 if base.resolve()==destination.resolve():raise ValueError('OVERLAP')
 if not re.fullmatch('[a-f0-9]{64}',expected_base_sha256) or sha(base)!=expected_base_sha256:raise ValueError('BASE_HASH')
 if base.stat().st_size>=MAX_ARCHIVE:raise ValueError('ARCHIVE_BOUND')
 if not isinstance(replacements,dict) or not all(safe(n) and isinstance(b,bytes) for n,b in replacements.items()):raise ValueError('REPLACEMENT_LAYOUT')
 if sum(map(len,replacements.values()))>MAX_REPLACEMENTS:raise ValueError('REPLACEMENT_BOUND')
 removed=set(removed)
 if not all(safe(n) for n in removed) or removed.intersection(replacements):raise ValueError('REMOVAL_LAYOUT')
 with zipfile.ZipFile(base,'r') as old:
  infos=old.infolist();names=[i.filename for i in infos]
  if len(names)>100000 or not all(safe(n) for n in names):raise ValueError('BASE_LAYOUT')
  if len(set(n.casefold() for n in names))!=len(names):raise ValueError('BASE_DUPLICATE')
  if not removed.issubset(names):raise ValueError('REMOVAL_MISSING')
  final_names=[n for n in names if n not in removed]+[n for n in replacements if n not in names]
  if len(set(n.casefold() for n in final_names))!=len(final_names):raise ValueError('TARGET_DUPLICATE')
  for i in infos:
   if i.flag_bits&9:raise ValueError('UNSUPPORTED_FLAGS')
   if i.file_size>=0xffffffff or i.compress_size>=0xffffffff:raise ValueError('UNSUPPORTED_MEMBER_ZIP64')
  with zipfile.ZipFile(destination,'x',allowZip64=True) as out:
   def replace(name,data):
    i=zipfile.ZipInfo(name,DATE);i.create_system=3;i.external_attr=0o100644<<16;i.compress_type=zipfile.ZIP_STORED
    out.writestr(i,data)
   for info in infos:
    name=info.filename
    if name in removed:continue
    if name in replacements:replace(name,replacements[name]);continue
    old.fp.seek(info.header_offset);header=old.fp.read(30)
    if len(header)!=30:raise ValueError('LOCAL_HEADER')
    h=struct.unpack('<4s5H3I2H',header)
    if h[0]!=b'PK\x03\x04' or h[2]!=info.flag_bits or h[3]!=info.compress_type or h[6]!=info.CRC or h[7]!=info.compress_size or h[8]!=info.file_size:raise ValueError('LOCAL_METADATA')
    extra=old.fp.read(h[9]+h[10])
    if len(extra)!=h[9]+h[10] or extra[:h[9]].decode('utf-8' if h[2]&0x800 else 'cp437')!=name:raise ValueError('LOCAL_NAME')
    cloned=copy.copy(info);cloned.header_offset=out.fp.tell();out.fp.write(header);out.fp.write(extra)
    remaining=info.compress_size
    while remaining:
     block=old.fp.read(min(1024*1024,remaining))
     if not block:raise ValueError('TRUNCATED_MEMBER')
     out.fp.write(block);remaining-=len(block)
    out.filelist.append(cloned);out.NameToInfo[name]=cloned;out._didModify=True;out.start_dir=out.fp.tell()
   for name in sorted(set(replacements)-set(names)):replace(name,replacements[name])
   if out.fp.tell()>=MAX_ARCHIVE:raise ValueError('TARGET_ARCHIVE_BOUND')
 if destination.stat().st_size>=MAX_ARCHIVE:raise ValueError('TARGET_ARCHIVE_BOUND')
 return {'sha256':sha(destination),'size':destination.stat().st_size,'members':len(final_names)}
