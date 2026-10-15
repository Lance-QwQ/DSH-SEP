import subprocess as s,pathlib,json,hashlib,os,shutil
root=pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-wayland-assets-20261014-r5');os.umask(0o077);root.mkdir(mode=0o700);payload=root/'payload';records=[]
packages=['sway','libwlroots12t64','wtype','grim','libjson-c5','libdisplay-info1','libliftoff0','libseat1','libxcb-res0','libxcb-ewmh2','libxcb-icccm4','libxcb-composite0','libxcb-render-util0','libinput10','libevdev2','libmtdev1t64','libwacom9','libwacom-common','libwayland-server0','libgles2','libxcb-xinput0','libwayland-dev','libwayland-bin','libgudev-1.0-0']
for package in packages:
 meta=s.check_output(['apt-cache','show',package],text=True).split('\n\n')[0];fields=dict(r.split(': ',1) for r in meta.splitlines() if ': ' in r and not r.startswith(' '))
 caches=[pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-wayland-assets-20261014-'+r) for r in ['r1','r2','r3','r4']]+[pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-portable-wayland-host-assets-r4'),pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-portable-wayland-host-assets-r6')]
 found=[p for cache in caches for p in cache.glob(package+'_*.deb') if hashlib.sha256(p.read_bytes()).hexdigest()==fields['SHA256']]
 if not found:raise RuntimeError('ASSET_MISSING:'+package)
 target=root/found[0].name;shutil.copy2(found[0],target);s.run(['dpkg-deb','-x',str(target),str(payload)],check=True,timeout=20);records.append({'package':package,'version':fields['Version'],'repositoryFile':fields['Filename'],'file':target.name,'sha256':fields['SHA256']})
env={**os.environ,'LD_LIBRARY_PATH':str(payload/'usr/lib/x86_64-linux-gnu')}
for name in ['sway','swaymsg','wtype','grim','wayland-scanner']:
 r=s.run(['ldd',str(payload/'usr/bin'/name)],capture_output=True,text=True,env=env,timeout=10);(root/(name+'.ldd.log')).write_text(r.stdout+r.stderr)
 if r.returncode or 'not found' in r.stdout:raise RuntimeError('WAYLAND_ASSET_DEPENDENCY:'+name)
(root/'RESULT.json').write_text(json.dumps({'status':'pass','scope':'test-only extracted Ubuntu Noble dependencies, no system installation','packages':records},indent=2)+'\n');print(json.dumps({'status':'pass','packages':len(records)}))
