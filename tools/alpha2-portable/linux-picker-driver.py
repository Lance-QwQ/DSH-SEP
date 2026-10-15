"""Test-only X11 native chooser driver. Never substitutes a browser File.
Each action requires a currently observed exact Open Files window and PID.
"""
import ctypes as c, ctypes.util, json, os, sys, time, urllib.parse, struct, zlib
x=c.CDLL(ctypes.util.find_library('X11'));t=c.CDLL(ctypes.util.find_library('Xtst'))
x.XOpenDisplay.restype=c.c_void_p;x.XOpenDisplay.argtypes=[c.c_char_p]
d=x.XOpenDisplay(None)
if not d:raise RuntimeError('X11_DISPLAY_UNAVAILABLE')
U=c.c_ulong;P=c.c_void_p
def bind(name,restype,args):
 f=getattr(x,name);f.restype=restype;f.argtypes=args;return f
root=bind('XDefaultRootWindow',U,[P])(d)
class Attributes(c.Structure):
 _fields_=[(n,typ) for n,typ in [('x',c.c_int),('y',c.c_int),('width',c.c_int),('height',c.c_int),('border_width',c.c_int),('depth',c.c_int),('visual',P),('root',U),('class_',c.c_int),('bit_gravity',c.c_int),('win_gravity',c.c_int),('backing_store',c.c_int),('backing_planes',U),('backing_pixel',U),('save_under',c.c_int),('colormap',U),('map_installed',c.c_int),('map_state',c.c_int),('all_event_masks',c.c_long),('your_event_mask',c.c_long),('do_not_propagate_mask',c.c_long),('override_redirect',c.c_int),('screen',P)]]
attributes=bind('XGetWindowAttributes',c.c_int,[P,U,c.POINTER(Attributes)])
query=bind('XQueryTree',c.c_int,[P,U,c.POINTER(U),c.POINTER(U),c.POINTER(c.POINTER(U)),c.POINTER(c.c_uint)])
name=bind('XFetchName',c.c_int,[P,U,c.POINTER(c.c_char_p)])
free=bind('XFree',c.c_int,[P]);sync=bind('XSync',c.c_int,[P,c.c_int])
atom=bind('XInternAtom',U,[P,c.c_char_p,c.c_int]);prop=bind('XGetWindowProperty',c.c_int,[P,U,U,c.c_long,c.c_long,c.c_int,U,c.POINTER(U),c.POINTER(c.c_int),c.POINTER(U),c.POINTER(U),c.POINTER(P)])
def pid(w):
 actual=U();fmt=c.c_int();n=U();after=U();data=P();prop(d,w,atom(d,b'_NET_WM_PID',0),0,1,0,0,c.byref(actual),c.byref(fmt),c.byref(n),c.byref(after),c.byref(data))
 value=c.cast(data,c.POINTER(U))[0] if data.value and n.value else None
 if data.value:free(data)
 return value
def windows(w,level=0):
 out=[];r=U();parent=U();children=c.POINTER(U)();count=c.c_uint()
 if query(d,w,c.byref(r),c.byref(parent),c.byref(children),c.byref(count)):
  for i in range(count.value):
   child=children[i];text=c.c_char_p()
   if name(d,child,c.byref(text)) and text.value:
    attr=Attributes();attributes(d,child,c.byref(attr))
    if attr.map_state==2:out.append({'id':child,'title':text.value.decode('utf8','replace'),'pid':pid(child)})
    free(text)
   if level<3:out.extend(windows(child,level+1))
  if children:free(children)
 return out
rows=windows(root);print(json.dumps({'windows':rows},ensure_ascii=False),flush=True)
if len(sys.argv)==1:sys.exit(0)
action,expected_pid=sys.argv[1],int(sys.argv[2]);matches=[w for w in rows if w['title']=='Open Files' and w['pid']==expected_pid]
if len(matches)!=1:raise RuntimeError('CHOOSER_NOT_UNIQUE_OR_NOT_OWNED')
w=matches[0]['id'];bind('XRaiseWindow',c.c_int,[P,U])(d,w);bind('XSetInputFocus',c.c_int,[P,U,c.c_int,U])(d,w,1,0);sync(d,0)
def capture(destination):
 r=U();gx=c.c_int();gy=c.c_int();width=c.c_uint();height=c.c_uint();border=c.c_uint();depth=c.c_uint()
 bind('XGetGeometry',c.c_int,[P,U,c.POINTER(U),c.POINTER(c.c_int),c.POINTER(c.c_int),c.POINTER(c.c_uint),c.POINTER(c.c_uint),c.POINTER(c.c_uint),c.POINTER(c.c_uint)])(d,w,c.byref(r),c.byref(gx),c.byref(gy),c.byref(width),c.byref(height),c.byref(border),c.byref(depth))
 img=bind('XGetImage',P,[P,U,c.c_int,c.c_int,c.c_uint,c.c_uint,U,c.c_int])(d,w,0,0,width.value,height.value,U(-1).value,2)
 pixel=bind('XGetPixel',U,[P,c.c_int,c.c_int]);data=bytearray()
 for y in range(height.value):
  data.append(0)
  for xx in range(width.value):
   v=pixel(img,xx,y);data.extend(((v>>16)&255,(v>>8)&255,v&255))
 def chunk(kind,body):return struct.pack('!I',len(body))+kind+body+struct.pack('!I',zlib.crc32(kind+body)&0xffffffff)
 with open(destination,'xb') as out:out.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',width.value,height.value,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b''))
 bind('XDestroyImage',c.c_int,[P])(img)
if os.environ.get('SEP_PICKER_SCREENSHOT'):capture(os.environ['SEP_PICKER_SCREENSHOT'])
keysym=bind('XStringToKeysym',U,[c.c_char_p]);keycode=bind('XKeysymToKeycode',c.c_ubyte,[P,U]);t.XTestFakeKeyEvent.argtypes=[P,c.c_uint,c.c_int,U]
class KeyEvent(c.Structure):
 _fields_=[('type',c.c_int),('serial',U),('send_event',c.c_int),('display',P),('window',U),('root',U),('subwindow',U),('time',U),('x',c.c_int),('y',c.c_int),('x_root',c.c_int),('y_root',c.c_int),('state',c.c_uint),('keycode',c.c_uint),('same_screen',c.c_int),('padding',c.c_char*96)]
send=bind('XSendEvent',c.c_int,[P,U,c.c_int,c.c_long,P]);modifiers=set()
def key(k,down=True):
 code=keycode(d,keysym(k.encode()))
 if not code:raise RuntimeError('KEY_UNAVAILABLE')
 state=(1 if 'Shift_L' in modifiers else 0)|(4 if 'Control_L' in modifiers else 0)
 event=KeyEvent(type=2 if down else 3,display=d,window=w,root=root,state=state,keycode=code,same_screen=1)
 t.XTestFakeKeyEvent(d,code,int(down),0);sync(d,0)
 if k in ('Shift_L','Control_L'):
  if down:modifiers.add(k)
  else:modifiers.discard(k)
def press(k):key(k);key(k,False);time.sleep(.06)
def chord(mod,k):key(mod);press(k);key(mod,False)
if action=='inspect':pass
elif action=='cancel':press('Escape')
elif action=='select':
 path=sys.argv[3]
 scope=os.environ.get('SEP_PICKER_INPUT_ROOT','')
 if not scope or os.path.realpath(scope)!=scope or os.path.realpath(path)!=path or os.path.commonpath([scope,path])!=scope or path==scope or not os.path.isfile(path):raise RuntimeError('SYNTHETIC_FILE_SCOPE')
 # GTK accepts file URIs. Percent encoding enters the exact Unicode filename
 # through ordinary key events without clipboard or browser injection.
 if not path.isascii():path='file://'+urllib.parse.quote(path)
 chord('Control_L','l');time.sleep(.2);chord('Control_L','a')
 for ch in path:
  mapping={'/':'slash','-':'minus','.':'period','_':'underscore'}
  if ch in '_%:' or ch.isupper():
   key('Shift_L');press({'_':'minus','%':'5',':':'semicolon'}.get(ch,ch.lower()));key('Shift_L',False)
  else:press(mapping.get(ch,ch))
 if os.environ.get('SEP_PICKER_SCREENSHOT'):capture(os.environ['SEP_PICKER_SCREENSHOT']+'.typed.png')
 # Activate the observed GTK Open button, rather than relying on the
 # location entry's Return semantics. The window is revalidated first.
 if not any(row['id']==w and row['pid']==expected_pid for row in windows(root)):raise RuntimeError('CHOOSER_CHANGED')
 attr=Attributes();attributes(d,w,c.byref(attr));rx=c.c_int();ry=c.c_int();child=U()
 bind('XTranslateCoordinates',c.c_int,[P,U,U,c.c_int,c.c_int,c.POINTER(c.c_int),c.POINTER(c.c_int),c.POINTER(U)])(d,w,root,attr.width-49,attr.height-23,c.byref(rx),c.byref(ry),c.byref(child))
 t.XTestFakeMotionEvent.argtypes=[P,c.c_int,c.c_int,c.c_int,U];t.XTestFakeButtonEvent.argtypes=[P,c.c_uint,c.c_int,U]
 t.XTestFakeMotionEvent(d,-1,rx.value,ry.value,0);t.XTestFakeButtonEvent(d,1,1,0);t.XTestFakeButtonEvent(d,1,0,0);sync(d,0);time.sleep(.7)
else:raise RuntimeError('ACTION_INVALID')
end=time.monotonic()+3
while action!='inspect' and any(row['id']==w for row in windows(root)) and time.monotonic()<end:time.sleep(.1)
remaining=windows(root);print(json.dumps({'action':action,'window':w,'pid':expected_pid,'remaining':remaining},ensure_ascii=False))
if action!='inspect' and any(row['id']==w for row in remaining):raise RuntimeError('CHOOSER_INPUT_NOT_APPLIED')
