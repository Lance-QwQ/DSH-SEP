"""Read-only final audit of the frozen installed package and owned test scope."""
import os,json,hashlib,stat
from pathlib import Path
base=Path('/opt/dsh-sep-cross-platform');program=base/'alpha2-portable-wayland-installed-r1/program'
manifest=program/'PAYLOAD-MANIFEST.json';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(manifest)=='1f087d0680ca3d0c1b13a38983d564b73c2a0e068b6ec1d9eb87fbc55ca5b196'
entries=json.loads(manifest.read_text())['entries'];files=0
for e in entries:
 p=program/e['path'];s=p.lstat()
 if e['kind']=='file':
  assert stat.S_ISREG(s.st_mode) and s.st_size==e['size'] and sha(p)==e['sha256'],e['path'];files+=1
 elif e['kind']=='directory':assert stat.S_ISDIR(s.st_mode),e['path']
 elif e['kind']=='link':assert stat.S_ISLNK(s.st_mode) and os.readlink(p)==e.get('target',e.get('linkTarget')),e['path']
 else:raise AssertionError(e)
expected={e['path'] for e in entries}|{'PAYLOAD-MANIFEST.json'}
actual=set()
def walk(p):
 for child in p.iterdir():
  actual.add(str(child.relative_to(program)))
  if child.is_dir() and not child.is_symlink():walk(child)
walk(program);assert actual==expected,{'added':sorted(actual-expected),'missing':sorted(expected-actual)}
remaining=[];unknown=[];auditController=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit() or int(p.name)==os.getpid():continue
 try:
  if p.stat().st_uid!=os.getuid():continue
  cmd=(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')
  if int(p.name)==os.getppid() and '/alpha2-portable-wayland-driver-' in cmd and '/wayland-certification/collect-final.mjs ' in cmd:
   auditController.append({'pid':int(p.name),'birthStat':(p/'stat').read_text(),'command':cmd,'scope':'direct parent running this read-only audit and evidence collection'});continue
  if 'alpha2-portable-wayland-' in cmd or 'alpha2-wayland-assets-' in cmd or '/usr/libexec/at-spi' in cmd or '/usr/bin/dbus-daemon' in cmd:remaining.append({'pid':int(p.name),'command':cmd})
 except FileNotFoundError:pass
 except PermissionError:unknown.append(int(p.name))
patch=program.parent/'data/home/profiles/desktop/cordis.patch.yml';assert 'wayland-certification/' not in patch.read_text()
result={'status':'pass' if not remaining and not unknown else 'blocked','manifestSha256':sha(manifest),'verifiedRegularFiles':files,'verifiedEntries':len(entries),'extraProgramFiles':0,'restoredProfilePatchSha256':sha(patch),'testInjectionRemaining':False,'resourceAudit':{'remaining':remaining,'unknown':unknown,'excludedAuditController':auditController,'scope':'recognized private Wayland test and AT-SPI/D-Bus processes for current UID in dedicated distro; not a claim about all OS resources'},'cleanupAttribution':'Each run retains its immediate receipt and PRIVATE-CLEANUP. Historical atspi-r17 required explicit identity-checked test recovery; final zero does not reclassify that run as pass.','programRebuilt':False,'dailyChanged':False,'published':False}
print(json.dumps(result,ensure_ascii=False,indent=2));assert result['status']=='pass'
