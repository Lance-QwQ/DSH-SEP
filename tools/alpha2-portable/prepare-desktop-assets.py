"""Download/extract distro-signed-metadata assets; never apt install/scripts."""
import subprocess as s,pathlib,json,hashlib,os,shutil
root=pathlib.Path('/opt/dsh-sep-cross-platform/alpha2-desktop-assets-20261013-r1');os.umask(0o077)
result=[]
for package in ['xvfb','xserver-common','libxfont2','x11-xkb-utils','libfontenc1','libxkbfile1']:
 meta=s.check_output(['apt-cache','show',package],text=True).split('\n\n')[0];fields=dict(row.split(': ',1) for row in meta.splitlines() if ': ' in row and not row.startswith(' '));version=fields['Version']
 s.run(['apt-get','download',package+'='+version],cwd=root,check=True)
 files=[p for p in root.glob(package+'_*.deb') if hashlib.sha256(p.read_bytes()).hexdigest()==fields['SHA256']]
 if len(files)!=1:raise RuntimeError('ASSET_IDENTITY')
 s.run(['dpkg-deb','-x',str(files[0]),str(root/'xserver')],check=True)
 result.append({'package':package,'version':version,'repositoryFile':fields['Filename'],'file':files[0].name,'sha256':fields['SHA256']})
(root/'XSERVER-ASSETS.json').write_text(json.dumps(result,indent=2)+'\n')
shutil.copy2('/usr/bin/dash',root/'xserver/usr/bin/sh')
(root/'XSERVER-SHELL.json').write_text(json.dumps({'source':'/usr/bin/dash','sha256':hashlib.sha256(pathlib.Path('/usr/bin/dash').read_bytes()).hexdigest()})+'\n')
print(json.dumps(result))
