import json,pathlib,shutil
base=pathlib.Path(r'D:\AIData\ProjectWork\DSH\bundle24-daily-deployment-20261011')
source=pathlib.Path(r'D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4\official-source\deepseek-harness-dsh-v0.2.1-alpha.1')
original=base/'alpha1-hoisted-r1';output=base/'alpha1-hoisted-r2';output.mkdir()
available={}
for directory in ('packages','apps','vendor'):
 for path in (source/directory).rglob('package.json'):
  if 'node_modules' in path.parts:continue
  value=json.loads(path.read_text('utf-8-sig'))
  if isinstance(value.get('name'),str):available[value['name']]=value
value=json.loads((original/'package.json').read_text('utf-8-sig'));value.pop('pnpm',None)
dependencies=value['dependencies'];added={}
queue=[]
for path in (original/'node_modules'/'@deepseek-ai').glob('*/package.json'):
 queue.append(json.loads(path.read_text('utf-8-sig')))
seen=set()
while queue:
 package=queue.pop()
 if package['name'] in seen:continue
 seen.add(package['name'])
 for name in (package.get('dependencies',{})|package.get('peerDependencies',{})):
  if name in available and name not in dependencies:
   target=available[name]
   if target.get('private'):raise RuntimeError('Private peer needs explicit build: '+name)
   dependencies[name]=target['version'];added[name]=target['version'];queue.append(target)
(output/'package.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n','utf-8')
(output/'pnpm-workspace.yaml').write_text('packages:\n  - .\nautoInstallPeers: false\nnodeLinker: hoisted\noverrides:\n  "@deepseek-ai/dsh-invariants": "0.2.0-rc.2"\n','utf-8')
shutil.copyfile(original/'pnpm-lock.yaml',output/'pnpm-lock.yaml')
(base/'PEER-CLOSURE-r2.json').write_text(json.dumps({'scope':'required first-party dependency and peer closure; installation pending','added':added},indent=2)+'\n','utf-8')
print(json.dumps({'output':str(output),'added':added}))
