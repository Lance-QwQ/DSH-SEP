import copy,hashlib,importlib.util,json,os,stat,tempfile,unittest,warnings,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('verify',Path(__file__).with_name('installer-verify-download.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sha=lambda b:hashlib.sha256(b).hexdigest()
ROOT=Path(os.environ['SEP_INSTALLER_TEST_ROOT']).resolve();ROOT.mkdir(parents=True,exist_ok=True)
class DownloadTests(unittest.TestCase):
 def fixture(self,empty=False,duplicate=False,traversal=False,link=False):
  r=Path(tempfile.mkdtemp(prefix='transport-',dir=ROOT));d=r/'download';o=r/'out';d.mkdir();o.mkdir()
  archive=b'this is a pinned inner archive';result=b'{"status":"pass"}';inventory=b'{"entries":[]}';build=b'{"build":true}';post=b'{"post":true}'
  members=[('result.json',result),('inventory.json',inventory),('build.json',build),('post.json',post),('part1',archive[:8]),('part2',archive[8:]),('logs/empty.log',b'' if empty else b'log')]
  if traversal:members[-1]=('../escape',b'log')
  with warnings.catch_warnings():
   warnings.simplefilter('ignore')
   with zipfile.ZipFile(d/'1.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    for name,b in members:
     if link and name=='logs/empty.log':
      i=zipfile.ZipInfo(name);i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,b)
     else:z.writestr(name,b)
    if duplicate:z.writestr('result.json',result)
  outer=(d/'1.zip').read_bytes();p={'status':'ready','commit':'a'*40,'artifact':'DSH-SEP-macOS-Alpha2-project-preview.zip','assemblyBytes':len(result),'assemblySha256':sha(result),'inventoryBytes':len(inventory),'inventorySha256':sha(inventory),'archiveBytes':len(archive),'archiveSha256':sha(archive),'verification':[{'name':'APP-BUILD-REVALIDATION.json','bytes':len(build),'sha256':sha(build)},{'name':'APP-POST-VERIFICATION.json','bytes':len(post),'sha256':sha(post)}]}
  t={'status':'ready','sourceCommit':p['commit'],'artifacts':[{'id':1,'name':'evidence','bytes':len(outer),'sha256':sha(outer),'members':[{'path':n,'bytes':len(b),'sha256':sha(b)} for n,b in members]}],'outputs':[{'name':n,'artifactId':1,'member':m} for n,m in [('RESULT.json','result.json'),('PACKAGE-INVENTORY.json','inventory.json'),('APP-BUILD-REVALIDATION.json','build.json'),('APP-POST-VERIFICATION.json','post.json')]],'parts':[{'index':i,'artifactId':1,'member':f'part{i}','bytes':len(b),'sha256':sha(b)} for i,b in [(1,archive[:8]),(2,archive[8:])]]}
  return p,t,d,o,archive
 def test_two_parts_and_exact_five_files(self):
  p,t,d,o,a=self.fixture();r=module.verify_download(p,t,d,o);self.assertEqual(r['status'],'pass');self.assertEqual((o/p['artifact']).read_bytes(),a);self.assertEqual(len(list(o.iterdir())),5)
 def test_empty_diagnostic_member_is_hashed_and_allowed(self):
  p,t,d,o,a=self.fixture(empty=True);self.assertEqual(module.verify_download(p,t,d,o)['status'],'pass')
 def test_outer_hash_mismatch_has_no_published_outputs(self):
  p,t,d,o,a=self.fixture();t['artifacts'][0]['sha256']='0'*64
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
  self.assertEqual(list(o.iterdir()),[])
 def test_unlisted_member_is_refused(self):
  p,t,d,o,a=self.fixture();t['artifacts'][0]['members'].pop()
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
 def test_member_hash_is_not_trusted_from_outer_zip(self):
  p,t,d,o,a=self.fixture();t['artifacts'][0]['members'][0]['sha256']='0'*64
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
 def test_duplicate_path(self):
  p,t,d,o,a=self.fixture(duplicate=True)
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
 def test_parent_path(self):
  p,t,d,o,a=self.fixture(traversal=True)
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
  self.assertFalse((o.parent/'escape').exists())
 def test_symlink(self):
  p,t,d,o,a=self.fixture(link=True)
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
 def test_swapped_parts_and_bad_final_archive(self):
  for mutation in [lambda p,t:t['parts'].reverse(),lambda p,t:p.update(archiveSha256='0'*64)]:
   p,t,d,o,a=self.fixture();mutation(p,t)
   with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
 def test_existing_output_never_overwritten(self):
  p,t,d,o,a=self.fixture();(o/'RESULT.json').write_bytes(b'user-data')
  with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
  self.assertEqual((o/'RESULT.json').read_bytes(),b'user-data')
 def test_source_commit_and_pending_refused(self):
  for mutation in [lambda p,t:t.update(sourceCommit='b'*40),lambda p,t:p.update(status='pending')]:
   p,t,d,o,a=self.fixture();mutation(p,t)
   with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
 def test_duplicate_output_and_unreviewed_proof_refused(self):
  for mutation in [lambda p,t:t['outputs'].__setitem__(1,t['outputs'][0]),lambda p,t:t['outputs'][2].update(member='post.json')]:
   p,t,d,o,a=self.fixture();mutation(p,t)
   with self.assertRaises(ValueError):module.verify_download(p,t,d,o)
if __name__=='__main__':unittest.main()
