"""One-time exact cleanup of two synthetic workers from failed red tests.
Not an application recovery mechanism and never included in the payload.
"""
import os,signal,json,time
from pathlib import Path
root=Path('/opt/dsh-sep-cross-platform/alpha2-portable-finalization-historical-cleanup-r57');root.mkdir(mode=0o700)
rows=[]
for pid,birth,cwd in [(205,'1831','review-red-r17'),(258,'12685','ancestry-r18')]:
 p=Path('/proc',str(pid));fields=(p/'stat').read_text().split(')')[-1].split();expected=Path('/opt/dsh-sep-cross-platform/alpha2-portable-finalization-'+cwd)
 if fields[19]!=birth or p.stat().st_uid!=os.getuid() or (p/'cwd').resolve()!=expected:raise RuntimeError('HISTORICAL_FIXTURE_IDENTITY_CHANGED')
 command=(p/'cmdline').read_bytes().split(b'\0');assert command[:3]==[b'/opt/dsh-sep-cross-platform/runtime/bin/node',b'-e',b"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"]
 fd=os.pidfd_open(pid)
 try:
  assert (p/'stat').read_text().split(')')[-1].split()[19]==birth
  signal.pidfd_send_signal(fd,signal.SIGKILL)
 finally:os.close(fd)
 deadline=time.monotonic()+5
 while p.exists() and time.monotonic()<deadline:
  if (p/'stat').read_text().split(')')[-1].split()[0]=='Z':break
  time.sleep(.05)
 stopped=not p.exists() or (p/'stat').read_text().split(')')[-1].split()[0]=='Z'
 assert stopped;rows.append({'pid':pid,'birth':birth,'cwd':str(expected),'signal':'SIGKILL','stopped':True,'attribution':'test cleanup of invalid failed red-fixture attempts, not production graceful cleanup'})
result={'status':'pass','rows':rows};(root/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
