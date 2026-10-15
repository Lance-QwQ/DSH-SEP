"""Real ZIP/filesystem tests; all generated fixtures remain in the explicit D: root."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import unittest
import warnings
import zipfile

ROOT = Path(sys.argv[1])
assert ROOT.is_absolute() and str(ROOT).lower().startswith('d:\\aidata\\projectwork\\dsh\\alpha2-windows-packages-20261015-r1\\')
ROOT.mkdir(parents=True, exist_ok=False)
sys.argv = [sys.argv[0]]
spec = importlib.util.spec_from_file_location('safe_extract', Path(__file__).with_name('safe_extract.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.home = ROOT / self.id().rsplit('.', 1)[-1]
        self.home.mkdir()
        self.archive = self.home / 'candidate.zip'
        self.dest = self.home / 'extracted'
        self.report = self.home / 'receipt.json'

    def make(self, rows):
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(self.archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
                for name, body in rows:
                    z.writestr(name, body)
        return hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def run_extract(self, digest=None):
        return module.extract_archive(self.archive, digest or hashlib.sha256(self.archive.read_bytes()).hexdigest(), self.dest, self.report)

    def rejects(self, rows, code):
        self.make(rows)
        with self.assertRaisesRegex(module.ExtractionError, '^'+code+'$'):
            self.run_extract()
        self.assertFalse(self.dest.exists(), 'invalid archive must be rejected before creating output')
        self.assertFalse(self.report.exists())

    def test_valid_archive_creates_exact_bytes_and_bound_receipt(self):
        digest = self.make([('folder/', b''), ('folder/中文.txt', b'hello'), ('manifest.json', b'{}')])
        result = self.run_extract(digest)
        self.assertEqual((self.dest/'folder/中文.txt').read_bytes(), b'hello')
        self.assertEqual((self.dest/'manifest.json').read_bytes(), b'{}')
        receipt = json.loads(self.report.read_text())
        self.assertEqual(result, receipt)
        self.assertEqual(receipt['status'], 'pass')
        self.assertEqual(receipt['archiveSha256'], digest)
        self.assertEqual(receipt['regularFiles'], 2)
        self.assertEqual(receipt['uncompressedBytes'], 7)

    def test_hash_mismatch_never_creates_destination(self):
        self.make([('ok.txt', b'ok')])
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_ARCHIVE_HASH$'):
            self.run_extract('0'*64)
        self.assertFalse(self.dest.exists())

    def test_long_windows_member_path_creates_exact_bytes(self):
        name = '/'.join(['package-segment-' + str(i) + '-' + 'x'*35 for i in range(5)]) + '/final-long-name.txt'
        target = self.dest.joinpath(*name.split('/'))
        self.assertGreater(len(str(target.parent)), 260)
        digest = self.make([(name, b'long-path-exact-content')])
        result = self.run_extract(digest)
        self.assertEqual(Path('\\\\?\\' + str(target)).read_bytes(), b'long-path-exact-content')
        self.assertEqual(result['regularFiles'], 1)
        self.assertEqual(result['uncompressedBytes'], 23)

    def test_existing_destination_is_not_overwritten(self):
        self.make([('sentinel', b'changed')]); self.dest.mkdir(); (self.dest/'sentinel').write_bytes(b'original')
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_DESTINATION_EXISTS$'):
            self.run_extract()
        self.assertEqual((self.dest/'sentinel').read_bytes(), b'original')

    def test_existing_receipt_refuses_before_extraction(self):
        self.make([('a', b'a')]); self.report.write_bytes(b'existing')
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_REPORT_EXISTS$'):
            self.run_extract()
        self.assertFalse(self.dest.exists()); self.assertEqual(self.report.read_bytes(), b'existing')

    def test_directory_alias_parent_refused(self):
        self.make([('safe', b'x')]); real = self.home/'real'; real.mkdir(); alias = self.home/'alias'
        result = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',"New-Item -ItemType Junction -Path '"+str(alias)+"' -Target '"+str(real)+"' | Out-Null"], capture_output=True, timeout=20)
        self.assertEqual(result.returncode,0,result.stderr.decode(errors='replace'))
        self.dest = alias/'extracted'
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_DESTINATION_ALIAS$'):
            self.run_extract()
        self.assertFalse((real/'extracted').exists())

    def test_hardlinked_archive_refused(self):
        self.make([('safe', b'x')]); os.link(self.archive,self.home/'other.zip')
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_ARCHIVE_IDENTITY$'):
            self.run_extract()
        self.assertFalse(self.dest.exists())

    def test_parent_traversal(self): self.rejects([('../escape',b'bad')],'ZIP_MEMBER_PATH')
    def test_absolute_path(self): self.rejects([('/absolute',b'bad')],'ZIP_MEMBER_PATH')
    def test_drive_or_ads(self): self.rejects([('a:stream',b'bad')],'ZIP_MEMBER_PATH')
    def test_backslash(self):
        # ZipFile.writestr normalizes backslashes on Windows: patch both actual
        # directory names after writing, so this tests real hostile ZIP bytes.
        self.make([('folder/x',b'bad')])
        raw=self.archive.read_bytes(); self.assertEqual(raw.count(b'folder/x'),2)
        self.archive.write_bytes(raw.replace(b'folder/x',b'folder\\x'))
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_MEMBER_PATH$'): self.run_extract()
        self.assertFalse(self.dest.exists())
    def test_dot_segment(self): self.rejects([('a/./b',b'bad')],'ZIP_MEMBER_PATH')
    def test_empty_segment(self): self.rejects([('a//b',b'bad')],'ZIP_MEMBER_PATH')
    def test_trailing_dot(self): self.rejects([('a./b',b'bad')],'ZIP_MEMBER_PATH')
    def test_trailing_space(self): self.rejects([('a /b',b'bad')],'ZIP_MEMBER_PATH')
    def test_reserved_device(self): self.rejects([('com1.txt',b'bad')],'ZIP_MEMBER_PATH')
    def test_windows_wildcard(self): self.rejects([('foo?.txt',b'bad')],'ZIP_MEMBER_PATH')
    def test_control_character(self): self.rejects([('a\x01b',b'bad')],'ZIP_MEMBER_PATH')
    def test_private_environment(self): self.rejects([('nested/.env',b'synthetic')],'ZIP_PRIVATE_ENTRY')
    def test_private_git(self): self.rejects([('.git/config',b'synthetic')],'ZIP_PRIVATE_ENTRY')
    def test_duplicate_member(self): self.rejects([('same',b'a'),('same',b'b')],'ZIP_DUPLICATE_MEMBER')
    def test_case_alias(self): self.rejects([('A.txt',b'a'),('a.txt',b'b')],'ZIP_DUPLICATE_MEMBER')
    def test_case_alias_in_implicit_directory(self): self.rejects([('Folder/a',b'a'),('folder/b',b'b')],'ZIP_DIRECTORY_ALIAS')
    def test_file_is_parent(self): self.rejects([('a',b'a'),('a/b',b'b')],'ZIP_MEMBER_CONFLICT')
    def test_parent_file_after_child(self): self.rejects([('a/b',b'b'),('a',b'a')],'ZIP_MEMBER_CONFLICT')
    def test_symlink(self):
        row=zipfile.ZipInfo('link'); row.create_system=3; row.external_attr=(stat.S_IFLNK|0o777)<<16
        self.rejects([(row,b'outside')],'ZIP_MEMBER_TYPE')
    def test_special_file(self):
        row=zipfile.ZipInfo('fifo'); row.create_system=3; row.external_attr=(stat.S_IFIFO|0o600)<<16
        self.rejects([(row,b'')],'ZIP_MEMBER_TYPE')
    def test_directory_type_without_slash(self):
        row=zipfile.ZipInfo('not-directory'); row.create_system=3; row.external_attr=(stat.S_IFDIR|0o755)<<16
        self.rejects([(row,b'')],'ZIP_MEMBER_TYPE')
    def test_declared_excessive_size(self):
        self.make([('a',b'a')]); raw=bytearray(self.archive.read_bytes()); c=raw.index(b'PK\x01\x02'); struct.pack_into('<I',raw,c+24,2147483649); self.archive.write_bytes(raw)
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_MEMBER_LIMIT$'): self.run_extract()
        self.assertFalse(self.dest.exists())
    def test_encryption_rejected(self):
        self.make([('a',b'a')]); raw=bytearray(self.archive.read_bytes()); c=raw.index(b'PK\x01\x02'); struct.pack_into('<H',raw,c+8,1); self.archive.write_bytes(raw)
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_MEMBER_ENCRYPTED$'): self.run_extract()
        self.assertFalse(self.dest.exists())
    def test_crc_failure_retains_partial_without_success_receipt(self):
        self.make([('a',b'a')]); raw=bytearray(self.archive.read_bytes()); c=raw.index(b'PK\x01\x02'); struct.pack_into('<I',raw,c+16,0); self.archive.write_bytes(raw)
        with self.assertRaisesRegex(module.ExtractionError, '^ZIP_CONTENT_INVALID$'): self.run_extract()
        self.assertTrue(self.dest.exists()); self.assertFalse(self.report.exists())

if __name__ == '__main__':
    unittest.main(verbosity=2)
