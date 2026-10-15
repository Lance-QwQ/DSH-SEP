"""Private test dependencies from APT metadata; extract only, no installation."""
import subprocess as s,pathlib,json,hashlib,os,shutil,urllib.request,time
root=pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-wayland-assets-20261014-r3');os.umask(0o077);root.mkdir(mode=0o700);payload=root/'payload';records=[]
packages=['sway','libwlroots12t64','wtype','grim','libjson-c5','libdisplay-info1','libliftoff0','libseat1','libxcb-res0','libxcb-ewmh2','libxcb-icccm4','libxcb-composite0','libxcb-render-util0','libinput10','libevdev2','libmtdev1t64','libwacom9','libwacom-common','libwayland-server0','libgles2','libxcb-xinput0']
for package in packages:
 meta=s.check_output(['apt-cache','show',package],text=True).split('\n\n')[0];fields=dict(r.split(': ',1) for r in meta.splitlines() if ': ' in r and not r.startswith(' '));version=fields['Version']
 cached=[p for old in ['r1','r2'] for p in pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-wayland-assets-20261014-'+old).glob(package+'_*.deb') if hashlib.sha256(p.read_bytes()).hexdigest()==fields['SHA256']]
 if cached:shutil.copy2(cached[0],root/cached[0].name)
 else:
  url='https://archive.ubuntu.com/ubuntu/'+fields['Filename'];errors=[]
  for attempt in range(1,4):
   try:
    with urllib.request.urlopen(url,timeout=25) as response:data=response.read(int(fields['Size'])+1)
    if len(data)!=int(fields['Size']) or hashlib.sha256(data).hexdigest()!=fields['SHA256']:raise RuntimeError('WAYLAND_ASSET_IDENTITY')
    (root/pathlib.Path(fields['Filename']).name).write_bytes(data);break
   except Exception as e:
    errors.append({'attempt':attempt,'type':type(e).__name__});(root/(package+'.errors.json')).write_text(json.dumps(errors)+'\n')
    if attempt==3:raise
    time.sleep(1)
 files=[p for p in root.glob(package+'_*.deb') if hashlib.sha256(p.read_bytes()).hexdigest()==fields['SHA256']]
 if len(files)!=1:raise RuntimeError('WAYLAND_ASSET_IDENTITY')
 s.run(['dpkg-deb','-x',str(files[0]),str(payload)],check=True,timeout=20);records.append({'package':package,'version':version,'repositoryFile':fields['Filename'],'file':files[0].name,'sha256':fields['SHA256']});(root/'PACKAGES.json').write_text(json.dumps(records,indent=2)+'\n')
env={**os.environ,'LD_LIBRARY_PATH':str(payload/'usr/lib/x86_64-linux-gnu')}
for name in ['sway','swaymsg','wtype','grim']:
 r=s.run(['ldd',str(payload/'usr/bin'/name)],capture_output=True,text=True,env=env,timeout=10);(root/(name+'.ldd.log')).write_text(r.stdout+r.stderr)
 if r.returncode or 'not found' in r.stdout:raise RuntimeError('WAYLAND_ASSET_DEPENDENCY:'+name)
result={'status':'pass','scope':'Ubuntu Noble APT-cache SHA256 binding; extraction only; not a product runtime dependency','packages':records};(root/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'pass','packages':len(records)}))
