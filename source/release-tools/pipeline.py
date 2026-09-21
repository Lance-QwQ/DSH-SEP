"""Create-only MIT Windows Alpha distribution. Never touches the old release/daily tree.

This is a release transformation of a pinned, already tested distribution, not a
claim that all transitive binaries can be independently rebuilt from this file.
"""
from pathlib import Path, PurePosixPath
import copy, datetime, hashlib, json, os, shutil, sys, zipfile

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'work/github-release-20260921-mit'
BASE = ROOT / 'deliverables/DSH-SEP-alpha2-20260921-office-r2'
OUT = ROOT / 'deliverables/DSH-SEP-Windows-Alpha-20260921-MIT'
REV = '20260921-mit-alpha'
DOCREV = '20260921-docs-r6'
NAMES = ['DSH-SEP-Full', 'DSH-SEP-Only']
OWNED = ['p0438', 'p0500', 'p0501', 'p0516', 'p0517', 'p0518', 'p0519']
BASE_GRAPH = 'a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8'
CUSTOM_HASH = 'cd9cc9395194fafd280dbdfcc510c193dc3d2784a85260540eb8b56d4e27b90a'
PINS = {
    'DSH-SEP-Full-Windows-x64.zip':'45efc954e9a52c130e98ab3f763c07e85e91362310c9fd3fab159c521ea3fbf6',
    'DSH-SEP-Only-Windows-x64.zip':'db988aa66864dbfefcf5b74dc86df07afb325f7453454858a0f23f224d870da0',
    'DSH-SEP-Source-20260921-office-r2.zip':'551b61946a4572f91dc3c294e5a4fc99c2b897231f4773d7a42938734244cc88',
    'DSH-SEP-Release-Docs-20260921-r5.zip':'1121aadd00b55d39948be17c0a8e8e2e80066a96e84c76bc844fd490b8cbc1d5',
}
MIT = '''MIT License

Copyright (c) 2026 DSH SEP contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''

def win(p):
    return Path('\\\\?\\'+str(p.resolve())) if os.name=='nt' and not str(p).startswith('\\\\?\\') else p
def read(p): return win(p).read_bytes()
def digest(p):
    with win(p).open('rb') as f:return hashlib.file_digest(f, 'sha256').hexdigest()
def readj(p): return json.loads(read(p).decode('utf-8-sig'))
def write(p,b):
    p=win(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def writej(p,j):write(p,(json.dumps(j,ensure_ascii=False,indent=2)+'\n').encode())
def files(p):return sorted((f for f in win(p).rglob('*') if f.is_file()),key=lambda f:f.as_posix())
def rel(f,p):return f.relative_to(win(p)).as_posix()
def cp(a,b):write(b,read(a))
def config():
    j=readj(WORK/'release-config.json')
    assert j['repositoryUrl'].startswith('https://github.com/') and '@' not in j['repositoryUrl']
    return j
def check_path(s):
    p=PurePosixPath(s);assert s and not p.is_absolute() and '..' not in p.parts and '\\' not in s and ':' not in s

def stage():
    assert not OUT.exists(), 'Create-only output already exists'
    for filename,sha in PINS.items():assert digest(BASE/filename)==sha,filename
    assert digest(BASE/'DSH-SEP-Full/graph.json')==BASE_GRAPH
    OUT.mkdir();rows=[]
    for name in NAMES:
        root=OUT/name;root.mkdir();archive=BASE/(name+'-Windows-x64.zip')
        with zipfile.ZipFile(archive) as z:
            names=z.namelist();assert len(names)==len(set(names))
            for item in z.infolist():
                check_path(item.filename);assert not item.is_dir()
                target=win(root/item.filename);target.parent.mkdir(parents=True,exist_ok=True)
                with z.open(item) as src,target.open('xb') as dst:shutil.copyfileobj(src,dst,1024*1024)
        rows.append({'package':name,'files':len(names),'archiveSha256':PINS[archive.name]});print(json.dumps(rows[-1]),flush=True)
    writej(WORK/'stage.json',{'status':'pass','baseGraphSha256':BASE_GRAPH,'packages':rows,'baseArchives':PINS})

def license_and_seal():
    full=OUT/NAMES[0];old=readj(BASE/NAMES[0]/'graph.json');oldmap={r['path']:r for r in old['files']};changes=[]
    for module in OWNED:
        base=BASE/NAMES[0]/'payload/store'/module;target=full/'payload/store'/module
        assert digest(base/'LICENSE')==CUSTOM_HASH,module
        pm=readj(target/'package.json');pm['license']='MIT';writej(target/'package.json',pm);write(target/'LICENSE',MIT.encode())
        if module=='p0438':
            originals=[{'path':r['path'].split('/',2)[2],'baselineSha256':r['sha256'],'bytes':r['size']} for r in old['files'] if r['path'].startswith('store/p0438/') and not r['path'].endswith('/LICENSE')]
            scope={'schema':1,'package':pm['name'],'version':pm['version'],'license':'MIT','includePatterns':['*.js','*.cs','*.ps1','*.d.ts','README.md','package.json'],'excludePatterns':['node_modules/**'],'baselineGraphSha256':BASE_GRAPH,'originalFiles':originals}
        else:
            scope=readj(base/'LICENSE-SCOPE.json');assert scope['package']==pm['name'];scope['license']='MIT'
        scope['licenseRevision']={'distribution':REV,'copyright':'2026 DSH SEP contributors','authorizedBy':'Project owner explicitly approved MIT for original SEP contributions and Windows Alpha publication with disclosed known issues.','previousLicenseSha256':CUSTOM_HASH,'sourceDistributionGraphSha256':BASE_GRAPH,'thirdPartyTermsUnchanged':True}
        writej(target/'LICENSE-SCOPE.json',scope)
        scope_md=f'''# MIT 许可适用范围

本包 `{pm['name']}` 的下列已确认原创部分，经项目所有者授权改用随包 MIT License。版权声明为 `2026 DSH SEP contributors`；此前有效授权不会撤销。

纳入范围：
'''+''.join('- `'+x+'`\n' for x in scope['includePatterns'])+'\n排除范围，继续使用各自原许可：\n'+''.join('- `'+x+'`\n' for x in scope['excludePatterns'])+f'''
本清单沿用已记录的原创范围，不把第三方、vendored 文件或原 DSH 改授 SEP 许可。已有 MIT 和其他第三方声明保持。`LICENSE-SCOPE.json` 保留原文件身份，并记录本次授权；当前完整文件身份由本修订程序图绑定。基线分发图：`{BASE_GRAPH}`。本轮不改变运行实现。
'''
        write(target/'LICENSE-SCOPE.md',scope_md.encode())
    # The authored adapter README is distribution documentation, not executable code.
    p=full/'payload/store/p0438/README.md';s=read(p).decode();s=s.replace('project-approved custom license','MIT license for original SEP contributions').replace('DSH SEP Limited Commercial Distribution License 1.0','MIT License').replace('DSH SEP 限制商业分发许可 1.0','MIT License')
    write(p,s.encode())
    g=copy.deepcopy(old);rows=[]
    for f in files(full/'payload'):
        r=rel(f,full/'payload');assert not f.is_symlink() and f.stat().st_nlink==1
        row={'path':r,'size':f.stat().st_size,'sha256':digest(f)};rows.append(row)
        if oldmap.get(r)!=row:changes.append({'path':r,'before':oldmap.get(r),'after':row})
    allowed_names={'LICENSE','LICENSE-SCOPE.md','LICENSE-SCOPE.json','package.json','README.md'}
    assert all(c['path'].split('/')[1] in OWNED and c['path'].split('/')[-1] in allowed_names for c in changes)
    newpaths={x['path'] for x in rows}
    assert oldmap.keys() <= newpaths, 'No baseline program files removed'
    g['files']=sorted(rows,key=lambda x:x['path']);gb=(json.dumps(g,ensure_ascii=False,indent=2)+'\n').encode();gh=hashlib.sha256(gb).hexdigest()
    for name in NAMES:
        root=OUT/name;write(root/'LICENSE',MIT.encode());write(root/'graph.json',gb);m=readj(root/'manifest.json');m['graph']={'size':len(gb),'sha256':gh};m['distributionRevision']=REV
        selected=set(m['payload'])
        for c in changes:
            if m['kind']=='full' or c['path'].split('/')[1] in OWNED:
                cp(full/'payload'/c['path'],root/'payload'/c['path'])
                if m['kind']!='full':selected.add(c['path'])
        if m['kind']!='full':m['payload']=sorted(selected)
        writej(root/'manifest.json',m)
        ha=readj(root/'host-adaptations.json');newmap={r['path']:r for r in rows}
        for r in ha:r['afterSha256']=newmap[r['path']]['sha256']
        writej(root/'host-adaptations.json',ha)
    identity={'status':'pass','distribution':REV,'baseGraphSha256':BASE_GRAPH,'graphSha256':gh,'changes':changes,'scope':'Only mapped original LICENSE/LICENSE-SCOPE, package license declarations and authored documentation changed. Every other graph file, including executable implementation and third-party code/notices, is byte-identical.','changedFiles':len(changes),'unchangedFiles':len(oldmap)-sum(c['before'] is not None for c in changes),'addedFiles':sum(c['before'] is None for c in changes),'codeChanges':0,'mappedOriginalModules':OWNED,'packages':len(g['packages']),'files':len(rows)}
    writej(WORK/'program-identity.json',identity);print(json.dumps({k:v for k,v in identity.items() if k!='changes'}),flush=True)

if __name__=='__main__':
    {'stage':stage,'license':license_and_seal}[sys.argv[1]]()
