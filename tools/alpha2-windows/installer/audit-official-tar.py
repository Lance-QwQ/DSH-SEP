"""Read npm tar members without extracting paths or executing package code."""
import hashlib, json, tarfile, sys
from pathlib import Path

class ByteMismatch(ValueError):
    def __init__(self, report):
        super().__init__('OFFICIAL_REQUIRED_BYTES')
        self.report = report

def safe_path(path):
    if not isinstance(path,str) or not path or '\\' in path or any(ord(c)<32 for c in path) or any(p in ('','.','..') for p in path.split('/')):
        raise ValueError('OFFICIAL_MEMBER_PATH')
    return path

def audit_tar(archive, spec):
    required = spec['required']; expected = {}
    if len(required)>100000: raise ValueError('OFFICIAL_MEMBER_LIMIT')
    for row in required:
        path=safe_path(row['path'])
        if path in expected: raise ValueError('OFFICIAL_MEMBER_DUPLICATE')
        expected[path]=row
    found={};seen=set();count=0;total=0;manifest=None
    with tarfile.open(archive,'r:gz') as package:
        for member in package:
            count+=1;total+=member.size
            if count>100000 or total>256*1024*1024 or member.size<0:raise ValueError('OFFICIAL_MEMBER_LIMIT')
            name=member.name.rstrip('/') if member.isdir() else member.name
            safe_path(name)
            if name=='package' and member.isdir():continue
            if not name.startswith('package/'):raise ValueError('OFFICIAL_MEMBER_PATH')
            path=name[len('package/'):]
            if path in seen:raise ValueError('OFFICIAL_MEMBER_DUPLICATE')
            seen.add(path)
            if path not in expected and path!='package.json':continue
            if member.type not in (tarfile.REGTYPE,tarfile.AREGTYPE):raise ValueError('OFFICIAL_MEMBER_TYPE')
            if path=='package.json' and member.size>1024*1024:raise ValueError('OFFICIAL_MANIFEST_LIMIT')
            digest=hashlib.sha256();size=0;chunks=[]
            stream=package.extractfile(member)
            while True:
                chunk=stream.read(1024*1024)
                if not chunk:break
                size+=len(chunk)
                if size>member.size:raise ValueError('OFFICIAL_MEMBER_LIMIT')
                digest.update(chunk)
                if path=='package.json':chunks.append(chunk)
            if size!=member.size:raise ValueError('OFFICIAL_MEMBER_TRUNCATED')
            found[path]={'path':path,'size':size,'sha256':digest.hexdigest()}
            if path=='package.json':manifest=json.loads(b''.join(chunks))
    if not manifest or manifest.get('name')!=spec['name'] or manifest.get('version')!=spec['version']:raise ValueError('OFFICIAL_MANIFEST_BINDING')
    mismatches=[];files=[]
    if found['package.json']['sha256']!=spec['manifestHash']:mismatches.append({'path':'package.json','reason':'manifest-sha256','actualSha256':found['package.json']['sha256'],'expectedSha256':spec['manifestHash']})
    for path,row in expected.items():
        actual=found.get(path)
        if not actual:mismatches.append({'path':path,'reason':'missing'})
        elif row['size']!=actual['size'] or row['sha256']!=actual['sha256']:mismatches.append({'path':path,'reason':'bytes','expectedSha256':row['sha256'],'actualSha256':actual['sha256'],'expectedSize':row['size'],'actualSize':actual['size']})
        else:files.append(actual)
    report={'schema':1,'status':'mismatch' if mismatches else 'pass','name':spec['name'],'version':spec['version'],'tarMembers':count,'declaredUncompressedBytes':total,'manifestSha256':found['package.json']['sha256'],'files':files,'mismatches':mismatches,'extracted':False,'packageCodeExecuted':False}
    if mismatches:raise ByteMismatch(report)
    return report

if __name__=='__main__':
    archive,spec_path,out=sys.argv[1:];raw=Path(spec_path).read_bytes()
    if len(raw)>8*1024*1024:raise ValueError('OFFICIAL_SPEC_LIMIT')
    try:result=audit_tar(archive,json.loads(raw));code=0
    except ByteMismatch as error:result=error.report;code=3
    except Exception as error:result={'schema':1,'status':'blocked','code':str(error) if str(error).startswith('OFFICIAL_') else 'OFFICIAL_TAR_PARSE','extracted':False,'packageCodeExecuted':False};code=1
    with open(out,'x',encoding='utf-8') as stream:json.dump(result,stream,indent=2);stream.write('\n')
    sys.exit(code)
