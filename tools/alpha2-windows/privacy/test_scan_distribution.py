import base64, hashlib, io, json, os, pathlib, struct, tempfile, unittest, zipfile
import gzip, tarfile
from unittest.mock import patch
import scan_distribution
from scan_distribution import audit_bytes, audit_graph, audit_zip

ROOT = pathlib.Path(os.environ['SEP_PRIVACY_TEST_ROOT'])
assert ROOT.is_absolute() and str(ROOT).startswith('D:') and ROOT.is_dir()
sha = lambda b: hashlib.sha256(b).hexdigest()
TOKEN = b'ghp_' + b'A' * 36

def zipped(entries):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for path, data in entries:
            z.writestr(path, data)
    return out.getvalue()

def asar(path, data):
    header = json.dumps({'files': {path: {'size': len(data), 'offset': '0'}}}, separators=(',', ':')).encode()
    payload = struct.pack('<I', len(header)) + header
    payload += b'\0' * ((-len(payload)) % 4)
    block = struct.pack('<I', len(payload)) + payload
    return struct.pack('<II', 4, len(block)) + block + data

class DistributionTests(unittest.TestCase):
    def fixture(self, data, name='candidate.zip'):
        root = pathlib.Path(tempfile.mkdtemp(prefix='privacy-', dir=ROOT))
        path = root / name
        path.write_bytes(data)
        return path

    def test_text_rules_report_only_classification_and_position(self):
        data = b'// path\nC:\\Users\\test-person\\secret\n' + TOKEN
        r = audit_bytes(data)
        self.assertEqual(r['status'], 'fail')
        self.assertTrue({'windows-home', 'github-token'} <= {f['rule'] for f in r['findings']})
        self.assertTrue(all('line' in f and 'path' in f for f in r['findings']))
        self.assertNotIn(TOKEN.decode(), json.dumps(r))
        self.assertNotIn('test-person', json.dumps(r))

    def test_archive_replaced_after_hash_is_not_accepted(self):
        data = zipped([('program.js', b'public')])
        path = self.fixture(data)
        original = scan_distribution.Scanner.zip
        def replace(scanner, stream, *args, **kwargs):
            original(scanner, stream, *args, **kwargs)
            path.write_bytes(data + b'changed')
        with patch.object(scan_distribution.Scanner, 'zip', replace):
            result = audit_zip(path, sha(data))
        self.assertEqual(result['status'], 'fail')
        self.assertTrue(any(f['rule'] == 'source-binding' for f in result['findings']))

    def test_session_jsonl_is_flagged_without_reading_body(self):
        result = audit_bytes(TOKEN, 'home/sessions/session.jsonl')
        self.assertEqual(result['status'], 'fail')
        self.assertFalse(result['files'][0]['bodyRead'])
        self.assertFalse(any(f['rule'] == 'github-token' for f in result['findings']))

    def test_json_comments_preserve_strings_and_decode_escaped_values(self):
        data=b'{/* public */"url":"https://example.invalid/a//b", "value":"\\u0067hp_' + b'A'*36 + b'", // tail\n}'
        result=audit_bytes(data,'tsconfig.json')
        self.assertTrue(any(f['rule']=='github-token' and f['representation']=='json-decoded' for f in result['findings']))
        self.assertFalse(result['gaps'])

    def test_gzip_and_tar_payloads_are_scanned_without_execution(self):
        tar=io.BytesIO()
        with tarfile.open(fileobj=tar,mode='w') as archive:
            row=tarfile.TarInfo('program.txt'); row.size=len(TOKEN); archive.addfile(row,io.BytesIO(TOKEN))
        result=audit_bytes(gzip.compress(tar.getvalue()),'public.tar.gz')
        self.assertTrue(any(f['path'].endswith('!program.txt') and f['rule']=='github-token' for f in result['findings']))
        self.assertFalse(result['gaps'])

    def test_tar_internal_hardlink_is_scanned_but_external_link_rejected(self):
        for target, expected in [('program.txt','pass'),('../outside','fail')]:
            tar=io.BytesIO()
            with tarfile.open(fileobj=tar,mode='w') as archive:
                row=tarfile.TarInfo('program.txt');row.size=6;archive.addfile(row,io.BytesIO(b'public'))
                link=tarfile.TarInfo('alias.txt');link.type=tarfile.LNKTYPE;link.linkname=target;archive.addfile(link)
            result=audit_bytes(tar.getvalue(),'data.tar')
            self.assertEqual(result['status'],expected)
            if expected=='pass':self.assertTrue(any(f['path']=='data.tar!alias.txt' and f['sha256']==sha(b'public') for f in result['files']))

    def test_graph_hardlink_is_rejected_even_when_hash_matches(self):
        p=self.fixture(b'public','program.js');os.link(p,p.parent/'alias.js')
        graph=json.dumps({'schema':3,'files':[{'path':'program.js','size':6,'sha256':sha(b'public')}]}).encode()
        (p.parent/'graph.json').write_bytes(graph);(p.parent/'desktop-runtime.json').write_bytes(b'{}')
        result=audit_graph(p.parent,sha(graph),sha(b'{}'))
        self.assertEqual(result['status'],'fail')
        self.assertTrue(any(f['rule']=='source-binding' for f in result['findings']))

    def test_utf16_and_json_escapes_are_scanned(self):
        r = audit_bytes(('x\n' + TOKEN.decode()).encode('utf-16-le'), 'program.bin')
        self.assertTrue(any(f['rule'] == 'github-token' for f in r['findings']))
        r = audit_bytes(b'{"source":"\\u0043\\u003a/Users/test-person/project"}', 'origin.json')
        self.assertTrue(any(f['rule'] == 'windows-home' for f in r['findings']))

    def test_source_map_and_inline_map_content_are_decoded(self):
        data = json.dumps({'version': 3, 'sources': ['example.ts'], 'sourcesContent': [TOKEN.decode()]}).encode()
        r = audit_bytes(b'//# sourceMappingURL=data:application/json;base64,' + base64.b64encode(data), 'bundle.js')
        self.assertTrue(any(f['rule'] == 'github-token' for f in r['findings']))

    def test_stream_boundary_does_not_hide_token(self):
        r = audit_bytes(b'x' * 119 + b'\n' + TOKEN + b'\n', chunk_size=128)
        hits = [f for f in r['findings'] if f['rule'] == 'github-token']
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]['line'], 2)

    def test_nested_zip_and_asar_members_are_visited(self):
        data = zipped([('nested.zip', zipped([('inner.js', TOKEN)])), ('app.asar', asar('main.js', TOKEN))])
        r = audit_zip(self.fixture(data), sha(data))
        self.assertEqual(r['status'], 'fail')
        paths = [f['path'] for f in r['findings'] if f['rule'] == 'github-token']
        self.assertIn('nested.zip!inner.js', paths)
        self.assertIn('app.asar!main.js', paths)

    def test_unsafe_archive_names_and_symlinks_are_rejected(self):
        for entries in [[('../outside.js', TOKEN)], [('A.js', b'x'), ('a.js', b'y')]]:
            data = zipped(entries)
            r = audit_zip(self.fixture(data), sha(data))
            self.assertEqual(r['status'], 'fail')
            self.assertTrue(any(f['rule'] == 'unsafe-member' for f in r['findings']))
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            entry = zipfile.ZipInfo('link'); entry.create_system = 3; entry.external_attr = 0o120777 << 16
            z.writestr(entry, b'target')
        r = audit_zip(self.fixture(out.getvalue()), sha(out.getvalue()))
        self.assertEqual(r['status'], 'fail')

    def test_graph_and_separate_descriptor_require_exact_hashes(self):
        p = self.fixture(b'public', 'program.js'); root = p.parent
        graph = json.dumps({'schema': 3, 'files': [{'path': 'program.js', 'size': 6, 'sha256': sha(b'public')}]}).encode()
        descriptor = b'{"origin":"file:///D:/AIData/private-build"}'
        (root / 'graph.json').write_bytes(graph); (root / 'desktop-runtime.json').write_bytes(descriptor)
        r = audit_graph(root, sha(graph), sha(descriptor))
        self.assertTrue(any(f['path'] == 'desktop-runtime.json' and f['rule'] == 'absolute-file-url' for f in r['findings']))
        p.write_bytes(b'changed')
        r = audit_graph(root, sha(graph), sha(descriptor))
        self.assertEqual(r['status'], 'fail')
        self.assertTrue(any(f['rule'] == 'source-binding' for f in r['findings']))

    def test_state_file_body_is_not_read_or_reported(self):
        data = zipped([('.env', TOKEN), ('Cookies', TOKEN)])
        r = audit_zip(self.fixture(data), sha(data))
        self.assertEqual(r['status'], 'fail')
        self.assertEqual(len([f for f in r['findings'] if f['rule'] == 'state-artifact']), 2)
        self.assertFalse(any(f['rule'] == 'github-token' for f in r['findings']))
        self.assertTrue(all(f.get('bodyRead') is False for f in r['files']))

    def test_exact_review_exception_cannot_allow_changed_bytes(self):
        exception = {'path': 'fixture.js', 'sha256': sha(TOKEN), 'rule': 'github-token', 'line': 1, 'representation': 'raw', 'reason': 'Synthetic test literal'}
        r = audit_bytes(TOKEN, 'fixture.js', allowlist=[exception])
        self.assertEqual(r['status'], 'pass')
        r = audit_bytes(TOKEN + b'changed', 'fixture.js', allowlist=[exception])
        self.assertEqual(r['status'], 'fail')

    def test_limits_and_malformed_containers_never_claim_clean(self):
        data = zipped([('nested.zip', zipped([('inner.js', b'public')]))])
        r = audit_zip(self.fixture(data), sha(data), max_depth=0)
        self.assertEqual(r['status'], 'blocked')
        self.assertTrue(r['gaps'])
        r = audit_bytes(b'not-asar', 'app.asar')
        self.assertEqual(r['status'], 'blocked')

    def test_clean_archive_pass_is_explicitly_bounded(self):
        data = zipped([('program.js', b'export const n=1;')])
        r = audit_zip(self.fixture(data), sha(data))
        self.assertEqual(r['status'], 'pass')
        self.assertEqual(r.get('fullPrivacyAudit'), 'not_run')
        self.assertIs(r.get('noPrivateDataClaim'), False)
        self.assertEqual(r['files'][0]['sha256'], sha(b'export const n=1;'))

if __name__ == '__main__':
    unittest.main()
