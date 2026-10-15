"""Test-only X11 observer/WM_DELETE_WINDOW for one proven Electron owner.
No coordinates, global input injection, browser instrumentation or API keys.
"""
import ctypes as c,ctypes.util,json,sys,time,struct,zlib
from pathlib import Path
pid,expected_birth,action,destination=sys.argv[1:]
def check():
 s=Path('/proc',pid,'stat').read_text();f=s[s.rfind(')')+2:].split()
 if f[0]=='Z' or f[19]!=expected_birth:raise RuntimeError('WINDOW_OWNER_CHANGED')
check();x=c.CDLL(ctypes.util.find_library('X11'));P=c.c_void_p;U=c.c_ulong
def bind(n,r,a):
 f=getattr(x,n);f.restype=r;f.argtypes=a;return f
d=bind('XOpenDisplay',P,[c.c_char_p])(None)
if not d:raise RuntimeError('DISPLAY_UNAVAILABLE')
root=bind('XDefaultRootWindow',U,[P])(d);free=bind('XFree',c.c_int,[P]);atom=bind('XInternAtom',U,[P,c.c_char_p,c.c_int]);sync=bind('XSync',c.c_int,[P,c.c_int])
class Attributes(c.Structure):
 _fields_=[(n,t) for n,t in [('x',c.c_int),('y',c.c_int),('width',c.c_int),('height',c.c_int),('border_width',c.c_int),('depth',c.c_int),('visual',P),('root',U),('class_',c.c_int),('bit_gravity',c.c_int),('win_gravity',c.c_int),('backing_store',c.c_int),('backing_planes',U),('backing_pixel',U),('save_under',c.c_int),('colormap',U),('map_installed',c.c_int),('map_state',c.c_int),('all_event_masks',c.c_long),('your_event_mask',c.c_long),('do_not_propagate_mask',c.c_long),('override_redirect',c.c_int),('screen',P)]]
attributes=bind('XGetWindowAttributes',c.c_int,[P,U,c.POINTER(Attributes)])
prop=bind('XGetWindowProperty',c.c_int,[P,U,U,c.c_long,c.c_long,c.c_int,U,c.POINTER(U),c.POINTER(c.c_int),c.POINTER(U),c.POINTER(U),c.POINTER(P)])
query=bind('XQueryTree',c.c_int,[P,U,c.POINTER(U),c.POINTER(U),c.POINTER(c.POINTER(U)),c.POINTER(c.c_uint)]);name=bind('XFetchName',c.c_int,[P,U,c.POINTER(c.c_char_p)])
def owner(w):
 actual=U();fmt=c.c_int();n=U();after=U();data=P();prop(d,w,atom(d,b'_NET_WM_PID',0),0,1,0,0,c.byref(actual),c.byref(fmt),c.byref(n),c.byref(after),c.byref(data));value=c.cast(data,c.POINTER(U))[0] if data.value and n.value else None
 if data.value:free(data)
 return value
def title(w):
 actual=U();fmt=c.c_int();n=U();after=U();data=P();prop(d,w,atom(d,b'_NET_WM_NAME',0),0,256,0,0,c.byref(actual),c.byref(fmt),c.byref(n),c.byref(after),c.byref(data))
 value=c.string_at(data,n.value).decode('utf8','replace') if data.value and fmt.value==8 else ''
 if data.value:free(data)
 return value
inventory=[]
def windows(w,depth=0):
 rows=[];r=U();parent=U();children=c.POINTER(U)();count=c.c_uint()
 if query(d,w,c.byref(r),c.byref(parent),c.byref(children),c.byref(count)):
  for i in range(count.value):
   child=children[i];text=c.c_char_p()
   wm_pid=owner(child);attr=Attributes();attributes(d,child,c.byref(attr));inventory.append({'id':child,'pid':wm_pid,'mapped':attr.map_state})
   if wm_pid==int(pid) and attr.map_state==2:
    # Chromium can publish only UTF-8 _NET_WM_NAME, leaving legacy WM_NAME
    # absent. Ownership and visibility, not the optional title, select a window.
    rows.append({'id':child,'title':title(child),'pid':int(pid)})
   if depth<3:rows.extend(windows(child,depth+1))
  if children:free(children)
 return rows
rows=windows(root)
if len(rows)!=1:
 print(json.dumps({'observedOwnedWindows':rows,'inventory':inventory[:128]}),flush=True)
 raise RuntimeError('OWNED_MAIN_WINDOW_NOT_UNIQUE')
w=rows[0]['id'];check()
if action=='capture':
 r=U();gx=c.c_int();gy=c.c_int();width=c.c_uint();height=c.c_uint();border=c.c_uint();depth=c.c_uint()
 bind('XGetGeometry',c.c_int,[P,U,c.POINTER(U),c.POINTER(c.c_int),c.POINTER(c.c_int),c.POINTER(c.c_uint),c.POINTER(c.c_uint),c.POINTER(c.c_uint),c.POINTER(c.c_uint)])(d,w,c.byref(r),c.byref(gx),c.byref(gy),c.byref(width),c.byref(height),c.byref(border),c.byref(depth))
 if width.value<400 or height.value<300 or width.value*height.value>4000000:raise RuntimeError('WINDOW_DIMENSIONS')
 img=bind('XGetImage',P,[P,U,c.c_int,c.c_int,c.c_uint,c.c_uint,U,c.c_int])(d,w,0,0,width.value,height.value,U(-1).value,2);pixel=bind('XGetPixel',U,[P,c.c_int,c.c_int]);data=bytearray();colors=set()
 for y in range(height.value):
  data.append(0)
  for xx in range(width.value):
   v=pixel(img,xx,y);colors.add(v);data.extend(((v>>16)&255,(v>>8)&255,v&255))
 def chunk(k,b):return struct.pack('!I',len(b))+k+b+struct.pack('!I',zlib.crc32(k+b)&0xffffffff)
 bind('XDestroyImage',c.c_int,[P])(img)
 if len(colors)<10:raise RuntimeError('WINDOW_BLANK')
 with open(destination,'xb') as out:out.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',width.value,height.value,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b''))
 rows[0].update(width=width.value,height=height.value,distinctColors=len(colors))
elif action=='close':
 class Event(c.Structure):_fields_=[('type',c.c_int),('serial',U),('send_event',c.c_int),('display',P),('window',U),('message_type',U),('format',c.c_int),('data',c.c_long*5),('padding',c.c_char*96)]
 e=Event(type=33,display=d,window=w,message_type=atom(d,b'WM_PROTOCOLS',0),format=32);e.data[0]=atom(d,b'WM_DELETE_WINDOW',0);e.data[1]=0
 if not bind('XSendEvent',c.c_int,[P,U,c.c_int,c.c_long,P])(d,w,0,0,c.byref(e)):raise RuntimeError('CLOSE_NOT_SENT')
 sync(d,0)
else:raise RuntimeError('ACTION')
print(json.dumps({'status':'pass','action':action,'windows':rows}));bind('XCloseDisplay',c.c_int,[P])(d)
