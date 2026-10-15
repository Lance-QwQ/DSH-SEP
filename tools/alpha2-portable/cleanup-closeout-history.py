"""Stop exactly the two a11y daemons created by failed r6/r7 test cases.
No process-name or process-group kill. Verify PID identity immediately first.
"""
import os,json,signal,time
from pathlib import Path
expected=['/usr/bin/dbus-daemon','--config-file=/usr/share/defaults/at-spi2/accessibility.conf','--nofork','--print-address','11','--address=unix:path=/mnt/wslg/runtime-dir/at-spi/bus_0']
rows=[]
for pid in [122,267]:
 root=Path('/proc')/str(pid)
 if not root.exists():rows.append({'pid':pid,'status':'already-absent'});continue
 if root.stat().st_uid!=os.getuid():raise RuntimeError('OWNER_CHANGED')
 cmd=(root/'cmdline').read_bytes().rstrip(b'\0').split(b'\0');cmd=[x.decode() for x in cmd]
 if cmd!=expected:raise RuntimeError('COMMAND_CHANGED')
 prior=(root/'stat').read_text();birth=prior[prior.rfind(')')+2:].split()[19]
 current=(root/'stat').read_text()
 if current[current.rfind(')')+2:].split()[19]!=birth:raise RuntimeError('BIRTH_CHANGED')
 os.kill(pid,signal.SIGTERM);until=time.monotonic()+3
 while root.exists() and time.monotonic()<until:
  current=(root/'stat').read_text()
  if current[current.rfind(')')+2:].split()[0]=='Z':break
  time.sleep(.05)
 if root.exists() and (root/'stat').read_text().split(')')[-1].split()[0]!='Z':raise RuntimeError('STOP_UNCONFIRMED')
 rows.append({'pid':pid,'birth':birth,'status':'terminated','method':'exact PID + UID + command + birth recheck; SIGTERM, waited'})
print(json.dumps({'status':'pass','scope':'historical r6/r7 a11y daemons only','processes':rows}))
