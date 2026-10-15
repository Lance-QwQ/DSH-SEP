import importlib.util, unittest, tempfile, tarfile, io, json, hashlib, os
from pathlib import Path
loader=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-official-tar.py'));audit=importlib.util.module_from_spec(loader);loader.loader.exec_module(audit)
ROOT=Path(os.environ['SEP_WINDOWS_INSTALL_TEST_ROOT']);ROOT.mkdir(parents=True,exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
class Tests(unittest.TestCase):
 def fixture(self, change=False, link=False):
  directory=Path(tempfile.mkdtemp(dir=ROOT));archive=directory/'official.tgz';manifest=json.dumps({'name':'@deepseek-ai/dsh','version':'0.2.1-alpha.2'}).encode();body=b'fixed official bytes';spec={'name':'@deepseek-ai/dsh','version':'0.2.1-alpha.2','manifestHash':sha(manifest),'required':[{'path':'lib/index.js','size':len(body),'sha256':sha(body)}]}
  with tarfile.open(archive,'w:gz') as t:
   for name,data in [('package/package.json',manifest),('package/lib/index.js',b'changed' if change else body)]:
    info=tarfile.TarInfo(name);info.size=len(data)
    if link and name.endswith('index.js'):info.type=tarfile.SYMTYPE;info.linkname='../../outside';info.size=0
    t.addfile(info,io.BytesIO(data))
  return archive,spec
 def test_exact_required_and_package_manifest(self):
  archive,spec=self.fixture();r=audit.audit_tar(archive,spec);self.assertEqual(r['status'],'pass');self.assertEqual(len(r['files']),1)
 def test_changed_required_rejected(self):
  archive,spec=self.fixture(change=True)
  with self.assertRaisesRegex(ValueError,'OFFICIAL_REQUIRED_BYTES'):audit.audit_tar(archive,spec)
 def test_selected_link_rejected_without_extraction(self):
  archive,spec=self.fixture(link=True)
  with self.assertRaisesRegex(ValueError,'OFFICIAL_MEMBER_TYPE'):audit.audit_tar(archive,spec)
if __name__=='__main__':unittest.main()
