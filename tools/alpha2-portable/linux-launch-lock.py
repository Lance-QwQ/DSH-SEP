"""Lease held by outer wrapper, independent guardian and Node owner.
The guardian survives simultaneous outer/Node death. It is not a daemon and
exits only after confirmed owned-process cleanup. Never delete a lock to unlock.
Node's spawn closes unlisted descriptors; Electron must not inherit these fds.
"""
import os,sys,fcntl,subprocess,signal,ctypes,json,time
from pathlib import Path

def emit(value,stream=sys.stderr):
 # A detached terminal or closed log pipe must not become a lease-release path.
 try:print(json.dumps(value),file=stream,flush=True);return True
 except (OSError,ValueError):return False

def blocked(code,status=1):
 print(json.dumps({'status':'blocked','code':code}),file=sys.stderr);sys.exit(status)
try:
 if len(sys.argv)<3:blocked('SEP_LINUX_LAUNCH_ARGUMENTS')
 root=Path(sys.argv[1]);s=root.lstat()
 if root.resolve()!=root or not root.is_dir() or s.st_uid!=os.getuid() or s.st_mode&0o077:blocked('SEP_LINUX_LAUNCH_DATA_ROOT')
except (OSError,ValueError):blocked('SEP_LINUX_LAUNCH_DATA_ROOT')
try:
 fd=os.open(root/'launcher.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600);s=os.fstat(fd)
 if s.st_nlink!=1 or s.st_uid!=os.getuid() or s.st_mode&0o077:blocked('SEP_LINUX_LAUNCH_LOCK')
 try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:blocked('SEP_LINUX_ALREADY_RUNNING',73)
except OSError:blocked('SEP_LINUX_LAUNCH_LOCK')
libc=ctypes.CDLL(None)
if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):blocked('SEP_LINUX_OWNER_UNAVAILABLE')
try:
 probe=os.pidfd_open(os.getpid())
 try:signal.pidfd_send_signal(probe,0)
 finally:os.close(probe)
except OSError:blocked('SEP_LINUX_OWNER_UNAVAILABLE')

outer=os.getpid()
guardian=os.fork()
if guardian:
 guardian_fd=os.pidfd_open(guardian)
 def forward(signum,frame):
  try:signal.pidfd_send_signal(guardian_fd,signum)
  except ProcessLookupError:pass
 signal.signal(signal.SIGTERM,forward);signal.signal(signal.SIGINT,forward)
 _,status=os.waitpid(guardian,0)
 os.close(guardian_fd)
 sys.exit(max(0,os.waitstatus_to_exitcode(status)) if os.WIFEXITED(status) else 1)

parent=os.getpid();node_fd=None;stop_started=None;owner_forced=False

def stop(signum,frame):
 global stop_started
 if stop_started is None:stop_started=time.monotonic()
 if node_fd is not None:
  try:signal.pidfd_send_signal(node_fd,signum)
  except ProcessLookupError:pass
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
# Set the death signal before checking the parent and before starting payload.
if libc.prctl(1,signal.SIGTERM)!=0 or os.getppid()!=outer or libc.prctl(36,1)!=0:blocked('SEP_LINUX_OWNER_UNAVAILABLE')
if stop_started is not None:blocked('SEP_LINUX_OWNER_START_CANCELLED')
control_read,control_write=os.pipe2(os.O_CLOEXEC|os.O_NONBLOCK)

def child_setup():
 if ctypes.CDLL(None).prctl(1,signal.SIGTERM)!=0 or os.getppid()!=parent:os._exit(74)
try:child=subprocess.Popen(sys.argv[2:],pass_fds=(fd,control_write),env={**os.environ,'SEP_LINUX_OWNER_CONTROL_FD':str(control_write)},preexec_fn=child_setup,start_new_session=True)
except OSError:blocked('SEP_LINUX_LAUNCH_FAILED')
os.close(control_write)
node_fd=os.pidfd_open(child.pid)
if stop_started is not None:stop(signal.SIGTERM,None)
# Reserve the dead leader's PID until cleanup is confirmed. Reaping it first
# would allow an unrelated process/session to reuse the numeric identity.
while os.waitid(os.P_PID,child.pid,os.WEXITED|os.WNOWAIT|os.WNOHANG) is None:
 try:
  request=os.read(control_read,64)
  if request and stop_started is None:stop_started=time.monotonic()
 except BlockingIOError:pass
 # This bounds shutdown only, never the duration of ordinary long tasks.
 if stop_started is not None and time.monotonic()-stop_started>=40 and not owner_forced:
  emit({'status':'blocked','code':'SEP_LINUX_OWNER_STOP_DEADLINE','forced':True,'resourcesRetained':True})
  owner_forced=True
  try:signal.pidfd_send_signal(node_fd,signal.SIGKILL)
  except ProcessLookupError:pass
 time.sleep(.05)
os.close(control_read)

def identity(pid):
 try:
  path=Path('/proc',str(pid));text=(path/'stat').read_text();fields=text[text.rfind(')')+2:].split()
  return {'pid':pid,'state':fields[0],'parent':int(fields[1]),'session':int(fields[3]),'birth':fields[19],'uid':path.stat().st_uid}
 except FileNotFoundError:return None

def members():
 rows=[];unknown=False
 try:entries=list(Path('/proc').iterdir())
 except OSError:return [],True
 for entry in entries:
  if not entry.name.isdigit():continue
  try:
   row=identity(int(entry.name))
   if row and row['state']!='Z':rows.append(row)
  except (OSError,ValueError,IndexError):unknown=True
 # Only these identities are retained: the live guardian and the WNOWAIT
 # session leader. Never infer ownership through reusable intermediate PIDs.
 # Escaped grandchildren become directly adopted after their ancestor stops.
 found=[]
 for row in rows:
  if row['pid']==parent:continue
  if row['session']==child.pid or row['parent']==parent:
   if row['uid']!=os.getuid():unknown=True
   else:found.append(row)
 if not found and not unknown:
  try:
   children=(Path('/proc',str(parent),'task',str(parent),'children')).read_text().split()
   if any(int(pid)!=child.pid for pid in children):unknown=True
  except (OSError,ValueError):unknown=True
 return found,unknown

def send(row,sig):
 handle=None
 try:
  handle=os.pidfd_open(row['pid']);current=identity(row['pid'])
  if current and (current['birth'],current['uid'])==(row['birth'],row['uid']):signal.pidfd_send_signal(handle,sig)
 except ProcessLookupError:pass
 except OSError:return False
 finally:
  if handle is not None:os.close(handle)
 return True

def reap():
 try:entries=list(Path('/proc').iterdir())
 except OSError:return
 for entry in entries:
  if not entry.name.isdigit() or int(entry.name)==child.pid:continue
  try:
   row=identity(int(entry.name))
   if row and row['state']=='Z' and row['parent']==parent:os.waitpid(row['pid'],os.WNOHANG)
  except (OSError,ValueError,IndexError):pass

started=time.monotonic();forced=owner_forced;warned=False;term=set()
while True:
 reap();rows,unknown=members()
 if not rows and not unknown:break
 elapsed=time.monotonic()-started
 for row in rows:
  key=(row['pid'],row['birth'])
  if elapsed>=2:
   forced=True
   if not send(row,signal.SIGKILL):unknown=True
  elif key not in term:
   if send(row,signal.SIGTERM):term.add(key)
   else:unknown=True
 if elapsed>=5 and not warned:
  # Never unlock an unconfirmed live owner just to return a bounded exit code.
  emit({'status':'blocked','code':'SEP_LINUX_OWNER_CLEANUP_UNCONFIRMED','resourcesRetained':True});warned=True
 time.sleep(1 if warned else .05)
reap()
code=child.wait();os.close(node_fd);node_fd=None
abnormal=code!=0 or forced or warned
published=emit({'status':'blocked' if abnormal else 'pass','phase':'owner-closed','code':'SEP_LINUX_OWNER_EXITED' if code!=0 else 'SEP_LINUX_OWNER_FORCED' if forced else 'SEP_LINUX_OWNER_STOPPED','forced':forced,'resourcesConfirmedStopped':True,'scope':'observed owned session and adopted descendants; not all OS resources'},sys.stdout)
sys.exit(1 if abnormal or not published else 0)
