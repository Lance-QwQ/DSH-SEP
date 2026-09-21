"""Seal support files, produce immutable ZIPs, and read back every member."""
from pipeline import *
import re

ARCHIVES=['DSH-SEP-Full-Windows-x64.zip','DSH-SEP-Only-Windows-x64.zip','DSH-SEP-Source-20260921-MIT.zip','DSH-SEP-Release-Docs-20260921-MIT.zip']

def audit_metadata():
    identity=readj(WORK/'program-identity.json');gh=identity['graphSha256'];source=readj(WORK/'source-delivery.json');cfg=config()
    assert identity['codeChanges']==0 and identity['changedFiles']==28
    for name in NAMES:
        root=OUT/name;assert digest(root/'graph.json')==gh
        m=readj(root/'manifest.json');assert m['graph']['sha256']==gh
        s=readj(root/'RELEASE-STATUS.json');p=readj(root/'SOURCE-PROVENANCE.json');r=readj(root/'docs/RELEASE_MANIFEST.json')
        assert s['packageKind']==p['packageKind']==('full' if name.endswith('Full') else 'only')
        assert s['graphSha256']==p['distributionGraphSha256']==r['distribution']['graphSha256']==gh
        assert s['publicReleaseReady'] and s['publication']['ownerAuthorizedKnownIssues'] and not s['publication']['uploaded']
        assert s['validationBlockers']==[] and s['knownIssues'][0]['fixed'] is False
        assert p['sourceDelivery']['sourceFilesManifestSha256']==source['sourceFilesManifestSha256']
        assert s['publication']['repositoryUrl']==cfg['repositoryUrl']
        assert digest(root/'LICENSE')==hashlib.sha256(MIT.encode()).hexdigest()
        current=[root/'README.md']+[f for f in files(root/'docs') if f.suffix=='.md' and '/history/' not in str(f).replace('\\','/')]
        for f in current:
            text=read(f).decode('utf-8');assert not re.search(r'@(GRAPH_SHA256|PUBLIC_REPOSITORY_URL|SOURCE_FILES_SHA256|MIT_VALIDATION_SUMMARY)@',text),str(f)
        for module in OWNED:
            payload=OUT/'DSH-SEP-Full/payload/store'/module
            assert readj(payload/'package.json')['license']=='MIT' and readj(payload/'LICENSE-SCOPE.json')['license']=='MIT'
        rows=[]
        for f in files(root):
            within=rel(f,root)
            if within.startswith('payload/') or within in ['manifest.json','graph.json']:continue
            assert not f.is_symlink() and f.stat().st_nlink==1
            rows.append({'path':within,'size':f.stat().st_size,'sha256':digest(f)})
        m['support']=rows;writej(root/'manifest.json',m)
        # Installer and launcher are exact inherited implementations; only graph/support values change.
        for filename in ['installer.mjs','launcher.mjs','install.ps1','start.vbs','templates.json']:
            assert digest(root/filename)==digest(BASE/name/filename),filename
    writej(WORK/'public-audit.json',{'status':'pass','graphSha256':gh,'codeChanges':0,'installerCodeChanges':0,'sourceFiles':source['files'],'noticeEntries':readj(OUT/'DSH-SEP-Full/docs/DEPENDENCIES.json')['counts']['graphNoticeFiles']+readj(OUT/'DSH-SEP-Full/docs/DEPENDENCIES.json')['counts']['supplementalNoticeFiles']})
    print('MIT metadata/support/installer binding verified',flush=True)

def create_zip(root,archive,mapping=None):
    assert not archive.exists(),'Immutable archive already exists'
    candidates={rel(f,root):f for f in files(root)}
    if mapping is not None:
        expected=set(mapping)|{'manifest.json','graph.json'};assert candidates.keys()==expected,'Unbound or missing bundle files'
    else:
        mapping={r:{'size':p.stat().st_size,'sha256':digest(p)} for r,p in candidates.items()}
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for r in sorted(candidates):
            check_path(r);p=candidates[r];assert not p.is_symlink()
            if r in mapping:assert p.stat().st_size==mapping[r]['size'] and digest(p)==mapping[r]['sha256']
            z.write(p,r)
    with zipfile.ZipFile(archive) as z:
        assert len(z.namelist())==len(set(z.namelist()))==len(candidates)
        for r in z.namelist():
            h=hashlib.sha256();size=0
            with z.open(r) as f:
                while b:=f.read(1024*1024):h.update(b);size+=len(b)
            row=mapping.get(r) or {'size':candidates[r].stat().st_size,'sha256':digest(candidates[r])}
            assert size==row['size'] and h.hexdigest()==row['sha256'],r
    result={'status':'pass','filename':archive.name,'bytes':archive.stat().st_size,'sha256':digest(archive),'files':len(candidates)}
    print(json.dumps(result),flush=True);return result

def archive():
    assert readj(WORK/'public-audit.json')['status']=='pass';rows=[]
    for name in NAMES:
        root=OUT/name;m=readj(root/'manifest.json');g=readj(root/'graph.json');selected=set(m['payload'])
        items=m['support']+[dict(r,path='payload/'+r['path']) for r in g['files'] if m['kind']=='full' or r['path'] in selected]
        mapping={r['path']:r for r in items};assert len(mapping)==len(items)
        result=create_zip(root,OUT/(name+'-Windows-x64.zip'),mapping);result.update(kind=m['kind'],graphSha256=m['graph']['sha256']);rows.append(result)
        writej(WORK/'archives-in-progress.json',rows)
    rows.append(create_zip(OUT/'DSH-SEP-Source',OUT/ARCHIVES[2]))
    rows.append(create_zip(OUT/'DSH-SEP-Full/docs',OUT/ARCHIVES[3]))
    writej(WORK/'final-archives.json',rows);write(OUT/'SHA256SUMS.txt',''.join(r['sha256']+'  '+r['filename']+'\n' for r in rows).encode())

def privacy():
    # Known-path/credential scan; reports names and categories, never matched values.
    userfolder=Path(os.environ.get('USERPROFILE','')).name
    assert userfolder, 'A known local profile is required for the private-path scan'
    escaped=re.escape(userfolder.encode())
    developer=re.compile(rb'(?:[a-z]:[\\/]+Users[\\/]+'+escaped+rb'|/mnt/[a-z]/Users/'+escaped+rb'|Users%5[cC]'+escaped+rb')',re.I)
    secrets=re.compile(rb'(?<![A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})')
    rows=[]
    for filename in ARCHIVES:
        path=OUT/filename;hits=[]
        with zipfile.ZipFile(path) as z:
            for member in z.namelist():
                parts=PurePosixPath(member).parts;raw=z.read(member).replace(b'\0',b'');reasons=[]
                if developer.search(raw):reasons.append('known-developer-path')
                if secrets.search(raw):reasons.append('credential-pattern')
                if '.git' in parts:reasons.append('git-directory')
                if parts[-1] in ['.env','.env.local','.env.production'] or any(p in parts for p in ['.codex','local-secrets','home-rc2']):reasons.append('private-config-path')
                if reasons:hits.append({'member':member,'reasons':reasons})
        row={'filename':filename,'status':'fail' if hits else 'pass','sha256':digest(path),'filesScanned':len(z.namelist()),'hits':hits};rows.append(row);print(json.dumps(row),flush=True)
    result={'status':'pass' if all(r['status']=='pass' for r in rows) else 'fail','scope':'Every archived member, known developer paths, credential patterns, Git/private configuration paths; ASCII and NUL-stripped UTF16. Not a proof against arbitrary unknown secret encodings.','archives':rows};writej(WORK/'privacy.json',result);assert result['status']=='pass'

if __name__=='__main__':{'audit':audit_metadata,'archive':archive,'privacy':privacy}[sys.argv[1]]()
