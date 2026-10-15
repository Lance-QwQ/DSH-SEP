"""TEST ONLY: extra focused/bounds fields and synthetic Location text, owned private GTK only. Never shipped or sent to a model."""
"""Bounded AT-SPI semantic actions on one controller-owned application family.
No pointer coordinates, shell execution, arbitrary bus names or fallback input.
"""
import sys,json,os,hashlib,time,re
from pathlib import Path
import dbus
A='org.a11y.atspi.Accessible';P='org.freedesktop.DBus.Properties';LIMIT=1000
def fail(code):raise ValueError(code)
def birth(pid):
 p=Path('/proc')/str(pid);s=(p/'stat').read_text();f=s[s.rfind(')')+2:].split()
 if f[0]=='Z':fail('PROCESS_GONE')
 uid=int(re.search(r'^Uid:\s+(\d+)',(p/'status').read_text(),re.M)[1])
 return f[19],int(f[1]),uid
def check(owner):
 if not isinstance(owner,dict) or type(owner.get('pid')) is not int or owner['pid']<1:fail('OWNER_CHANGED')
 current,parent,uid=birth(owner['pid'])
 if current!=owner.get('birth') or uid!=os.getuid() or uid!=owner.get('uid') or Path('/proc/sys/kernel/random/boot_id').read_text().strip()!=owner.get('bootId'):fail('OWNER_CHANGED')
def belongs(pid,owner):
 seen=set()
 for _ in range(64):
  if pid in seen or pid<1:return False
  seen.add(pid);b,p,u=birth(pid)
  if u!=owner['uid']:return False
  if pid==owner['pid']:return b==owner['birth']
  pid=p
 return False
def ident(ref):return str(int(hashlib.sha256((str(ref[0])+'\0'+str(ref[1])).encode()).hexdigest()[:16],16)%9000000000000000000+1)
def main(request):
 owner=request['owner'];check(owner);op=request['operation'];args=request.get('arguments',{})
 if op not in ['observe','ui_snapshot','ui_find','ui_click']:fail('OPERATION')
 session=dbus.SessionBus();address=session.get_object('org.a11y.Bus','/org/a11y/bus').GetAddress(dbus_interface='org.a11y.Bus',timeout=1)
 bus=dbus.bus.BusConnection(str(address));daemon=bus.get_object('org.freedesktop.DBus','/org/freedesktop/DBus');cache={}
 def obj(ref):
  ref=(str(ref[0]),str(ref[1]))
  if ref not in cache:cache[ref]=bus.get_object(*ref)
  return cache[ref]
 def children(ref):return obj(ref).GetChildren(dbus_interface=A,timeout=1)
 registry=('org.a11y.atspi.Registry','/org/a11y/atspi/accessible/root');apps=[]
 for ref in children(registry):
  pid=int(daemon.GetConnectionUnixProcessID(str(ref[0]),dbus_interface='org.freedesktop.DBus',timeout=1))
  if belongs(pid,owner):apps.append(ref)
 if not apps:fail('APPLICATION_UNAVAILABLE')
 windows=[]
 for app in apps:
  for ref in children(app):windows.append(ref)
 if len(windows)>32:fail('WINDOW_LIMIT')
 if op=='observe' and not args.get('windowHandle'):
  rows=[{'windowHandle':ident(ref),'name':str(obj(ref).Get(A,'Name',dbus_interface=P,timeout=1))[:256]} for ref in windows]
  check(owner);return {'success':True,'windows':rows,'trust':'untrusted_ui_observation'}
 matches=[ref for ref in windows if ident(ref)==args.get('windowHandle')]
 if len(matches)!=1:fail('WINDOW_CHANGED')
 window=matches[0];seen=set();rows=[];references={}
 def walk(ref,parent=None,ancestors=(),dialog=False):
  key=(str(ref[0]),str(ref[1]))
  if key in seen:fail('TREE_CYCLE')
  seen.add(key)
  if len(seen)>LIMIT or len(ancestors)>32:fail('TREE_LIMIT')
  # Cross-process embedded content must still belong to the authorized family.
  pid=int(daemon.GetConnectionUnixProcessID(key[0],dbus_interface='org.freedesktop.DBus',timeout=1))
  if not belongs(pid,owner):fail('FOREIGN_EMBEDDED_APPLICATION')
  o=obj(ref);role=int(o.GetRole(dbus_interface=A,timeout=1));states=o.GetState(dbus_interface=A,timeout=1)
  has=lambda bit:bool(int(states[bit//32])&(1<<(bit%32)))
  name=str(o.Get(A,'Name',dbus_interface=P,timeout=1))[:256]
  # Password values/descriptions/text are never fetched. Names are labels only.
  try:aid=str(o.Get(A,'AccessibleId',dbus_interface=P,timeout=1))[:256]
  except dbus.DBusException as e:
   if e.get_dbus_name() not in ('org.freedesktop.DBus.Error.UnknownProperty','org.freedesktop.DBus.Error.InvalidArgs'):raise
   aid=''
  id=ident(ref)
  if id in references:fail('IDENTITY_COLLISION')
  dialog=dialog or role in (16,19) and (has(1) or has(16))
  item={'id':id,'name':name,'automationId':aid,'type':str(o.GetRoleName(dbus_interface=A,timeout=1)),'enabled':has(8) and has(24) and not has(6) and not has(27),'visible':has(25) and has(30),'parentElementId':parent,'dialog':dialog,'ancestors':list(ancestors)}
  item['focused']=has(12)
  interfaces=o.GetInterfaces(dbus_interface=A,timeout=1)
  if 'org.a11y.atspi.Component' in interfaces:
   try:item['bounds']=[int(v) for v in o.GetExtents(1,dbus_interface='org.a11y.atspi.Component',timeout=1)]
   except dbus.DBusException:pass
  if name=='Location' and role!=40 and 'org.a11y.atspi.Text' in interfaces:item['syntheticLocation']=str(o.GetText(0,1024,dbus_interface='org.a11y.atspi.Text',timeout=1))
  rows.append(item);references[id]=ref
  for child in children(ref):walk(child,id,(*ancestors,id),dialog)
 walk(window)
 def select(item):
  for k,field in [('name','name'),('automationId','automationId'),('controlType','type')]:
   if k in args and str(item[field]).casefold()!=str(args[k]).casefold():return False
  if args.get('elementId') and item['id']!=args['elementId']:return False
  if args.get('parentElementId') and args['parentElementId'] not in item['ancestors']:return False
  if args.get('scope')=='active_dialog' and not item['dialog']:return False
  return (not args.get('enabledOnly') or item['enabled']) and (not args.get('visibleOnly') or item['visible'])
 check(owner)
 if op in ('observe','ui_snapshot'):return {'success':True,'tree':[{k:v for k,v in r.items() if k not in ('ancestors','dialog')} for r in rows],'trust':'untrusted_ui_observation'}
 selected=[r for r in rows if select(r)]
 if op=='ui_find':return {'success':True,'elementCount':len(selected),'items':[{k:v for k,v in r.items() if k not in ('ancestors','dialog')} for r in selected]}
 if args.get('doubleClick'):fail('DOUBLE_CLICK_UNSUPPORTED')
 if len(selected)!=1 or not selected[0]['enabled'] or not selected[0]['visible']:fail('TARGET_NOT_UNIQUE_OR_ENABLED')
 item=selected[0];o=obj(references[item['id']]);action='org.a11y.atspi.Action';actions=o.GetActions(dbus_interface=action,timeout=1)
 # GetActions returns LOCALIZED names; GetName exposes the stable action key.
 if len(actions)>16:fail('ACTION_LIMIT')
 indices=[i for i in range(len(actions)) if str(o.GetName(i,dbus_interface=action,timeout=1)).casefold() in ('click','press','activate')]
 if len(indices)!=1:fail('ACTION_UNAVAILABLE_OR_AMBIGUOUS')
 # Last owner/state check immediately precedes the single action. A timeout
 # after this point is uncertain; the JS consumer quarantines and never retries.
 check(owner);fresh=o.GetState(dbus_interface=A,timeout=1)
 if not all(int(fresh[b//32])&(1<<(b%32)) for b in (8,24,25,30)):fail('TARGET_CHANGED')
 if not o.DoAction(indices[0],dbus_interface=action,timeout=1):fail('ACTION_UNCONFIRMED')
 return {'success':True,'action':'atspi-do-action'}
try:
 raw=sys.stdin.buffer.read(8193)
 if len(raw)>8192:fail('INPUT_LIMIT')
 result=main(json.loads(raw));body=json.dumps(result,ensure_ascii=False)
 if len(body.encode())>32768:fail('OUTPUT_LIMIT')
 print(body,flush=True)
except Exception as e:
 import traceback
 traceback.print_exc(file=sys.stderr)
 code=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z_]{1,64}',str(e)) else 'ATSPI_UNAVAILABLE'
 if isinstance(e,dbus.DBusException):
  suffix=e.get_dbus_name().split('.')[-1]
  if re.fullmatch('[A-Za-z_]{1,40}',suffix):code='DBUS_'+suffix.upper()
 print(json.dumps({'success':False,'errorType':code}),flush=True);sys.exit(1)
