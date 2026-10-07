"""Fixed Beta.2 transfer, never publication or general update execution."""
from pathlib import Path
import os,json,hashlib,urllib.request,urllib.error,urllib.parse,zipfile,subprocess,tempfile,sys,re
from zip_rewrite import rewrite,sha
REPO='Lance-QwQ/DSH-SEP';API='https://api.github.com/repos/'+REPO;TOKEN=os.environ['GITHUB_TOKEN'];RELEASE_ID=int(os.environ['RELEASE_ID']);COMMIT=os.environ['EXPECTED_COMMIT'];ROOT=Path(__file__).resolve().parent
assert re.fullmatch('[a-f0-9]{40}',COMMIT)
def headers():return {'Authorization':'Bearer '+TOKEN,'Accept':'application/vnd.github+json','User-Agent':'DSH-SEP-fixed-beta2-transfer','X-GitHub-Api-Version':'2022-11-28'}
def api(method,path,data=None):
 assert path.startswith(API+'/');body=None if data is None else json.dumps(data).encode();h=headers()
 if body is not None:h['Content-Type']='application/json'
 with urllib.request.urlopen(urllib.request.Request(path,data=body,method=method,headers=h),timeout=60) as response:return json.load(response) if response.status!=204 else None
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
def download(url,destination,size,digest,authenticated=False):
 parsed=urllib.parse.urlsplit(url);assert parsed.scheme=='https' and parsed.hostname in ['api.github.com','github.com','release-assets.githubusercontent.com']
 h={**(headers() if authenticated else {'User-Agent':'DSH-SEP-fixed-beta2-transfer'}),'Accept':'application/octet-stream'}
 opener=urllib.request.build_opener(NoRedirect())
 for _ in range(4):
  try:response=opener.open(urllib.request.Request(url,headers=h),timeout=120);break
  except urllib.error.HTTPError as e:
   if e.code not in [301,302,303,307,308]:raise RuntimeError('DOWNLOAD_HTTP_'+str(e.code)) from None
   url=e.headers['Location'];p=urllib.parse.urlsplit(url);assert p.scheme=='https' and p.hostname in ['github.com','release-assets.githubusercontent.com'];h={'User-Agent':'DSH-SEP-fixed-beta2-transfer'};e.close()
 else:raise RuntimeError('REDIRECT_LIMIT')
 count=0;hs=hashlib.sha256()
 with response,destination.open('xb') as out:
  for chunk in iter(lambda:response.read(1024**2),b''):
   count+=len(chunk);assert count<=size;hs.update(chunk);out.write(chunk)
 assert count==size and hs.hexdigest()==digest,'DOWNLOAD_HASH_SIZE'
def release():
 r=api('GET',API+'/releases/'+str(RELEASE_ID));assert r['draft'] and r['prerelease'] and r['tag_name']=='v0.2.1-beta.2' and r['target_commitish']==COMMIT
 ref=api('GET',API+'/git/ref/tags/v0.2.1-beta.2');assert ref['object']['type']=='commit' and ref['object']['sha']==COMMIT;return r
def exact(a,row):return a['state']=='uploaded' and a['size']==row['size'] and a.get('digest')=='sha256:'+row['sha256']
plan=json.loads((ROOT/'RELAY-PLAN.json').read_bytes());assert sha(ROOT/'zip_rewrite.py')==plan['rewriterSha256'];assert plan['tag']=='v0.2.1-beta.2';r=release();overlay=plan['overlay'];asset=next((a for a in r['assets'] if a['name']==overlay['name']),None)
# Re-runs with both final assets already uploaded do not require removed overlay.
all_done=all(any(a['name']==b['targetName'] and exact(a,b['target']) for a in r['assets']) for b in plan['bases'])
if not all_done:assert asset and exact(asset,overlay),'OVERLAY_ASSET'
with tempfile.TemporaryDirectory(prefix='sep-beta2-transfer-') as temp:
 W=Path(temp);blobZip=W/'overlay.zip'
 if not all_done:download(API+'/releases/assets/'+str(asset['id']),blobZip,overlay['size'],overlay['sha256'],True)
 for row in plan['bases']:
  r=release();old=next((a for a in r['assets'] if a['name']==row['targetName']),None)
  if old:assert exact(old,row['target']);print(json.dumps({'alreadyUploaded':old['name']}),flush=True);continue
  print(json.dumps({'phase':'download-base','kind':row['kind']}),flush=True);base=W/row['baseName'];download(row['baseUrl'],base,row['baseSize'],row['baseSha256'])
  replacements={}
  with zipfile.ZipFile(blobZip) as z:
   assert len(set(z.namelist()))==len(z.namelist())
   for entry in row['replacements']:
    assert z.getinfo(entry['blob']).file_size==entry['size']<=128*1024**2;b=z.read(entry['blob']);assert hashlib.sha256(b).hexdigest()==entry['sha256'];replacements[entry['path']]=b
  target=W/row['targetName'];result=rewrite(base,target,replacements,set(row['removed']),row['baseSha256']);assert result==row['target'],'TARGET_BYTES_DIFFER'
  u=urllib.parse.urlsplit(r['upload_url'].split('{')[0]);assert u.scheme=='https' and u.netloc=='uploads.github.com' and u.path=='/repos/'+REPO+'/releases/'+str(RELEASE_ID)+'/assets'
  upload=urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,urllib.parse.urlencode({'name':target.name}),''));quote=lambda x:'"'+x.replace('\\','\\\\').replace('"','\\"')+'"'
  config='\n'.join(['url = '+quote(upload),'request = "POST"','header = '+quote('Authorization: Bearer '+TOKEN),'header = "Content-Type: application/zip"','header = "Expect:"','data-binary = '+quote('@'+str(target)),'connect-timeout = 30','max-time = 1800','silent','show-error','write-out = "\\n%{http_code}\\n"'])+'\n'
  process=subprocess.run(['curl','--disable','--config','-'],input=config.encode(),capture_output=True,timeout=1830);assert len(process.stdout)<1024**2
  # Mutations are never blindly retried: inspect the draft even on a lost response.
  fresh=release();uploaded=next((a for a in fresh['assets'] if a['name']==target.name),None);assert uploaded and exact(uploaded,row['target']),'UPLOAD_UNKNOWN_OR_HASH_MISMATCH'
  print(json.dumps({'phase':'uploaded-and-verified','asset':target.name,'sha256':row['target']['sha256'],'curlExit':process.returncode}),flush=True)
 r=release()
 for row in plan['bases']:assert any(a['name']==row['targetName'] and exact(a,row['target']) for a in r['assets'])
 owned=next((a for a in r['assets'] if a['name']==overlay['name']),None)
 if owned:assert exact(owned,overlay);api('DELETE',API+'/releases/assets/'+str(owned['id']))
 final=release();assert not any(a['name']==overlay['name'] for a in final['assets']);print(json.dumps({'status':'pass','finalLargeArchivesVerified':2,'temporaryOverlayRemoved':True,'releaseStillDraft':True}),flush=True)
