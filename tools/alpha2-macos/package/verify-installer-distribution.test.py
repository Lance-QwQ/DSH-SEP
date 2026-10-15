"""Real, small ZIP fixtures; transport validation only, not a macOS test."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location('distribution', Path(__file__).with_name('verify-installer-distribution.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
sha = lambda data: hashlib.sha256(data).hexdigest()
encode = lambda value: (json.dumps(value, separators=(',', ':')) + '\n').encode()


class DownloadTests(unittest.TestCase):
    def fixture(self, mutate_manifest=None, corrupt_part=False, wrong_whole=False):
        root = Path(os.environ['SEP_DISTRIBUTION_TEST_ROOT']).resolve(strict=True)
        base = Path(tempfile.mkdtemp(prefix='case-', dir=root))
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('DSH SEP.app/Contents/test.txt', b'Synthetic application bytes only.\n' * 80)
        data = inner.getvalue()
        name = 'DSH-SEP-macOS-Alpha2-installer-preview.zip'
        middle = (len(data) + 1) // 2
        parts = [data[:middle], data[middle:]]
        assembly = {'status': 'pass', 'sourceCommit': 'a' * 40, 'artifact': name,
                    'artifactBytes': len(data), 'artifactSha256': 'e' * 64 if wrong_whole else sha(data)}
        assembly_bytes = encode(assembly)
        manifest = {'schema': 1, 'status': 'pass', 'assemblyResultSha256': sha(assembly_bytes),
                    'artifact': {'name': name, 'sha256': assembly['artifactSha256'], 'bytes': len(data)},
                    'partBytes': middle, 'totalBytes': len(data), 'parts': [
                        {'index': i + 1, 'name': name + f'.{i + 1:04}.part',
                         'bytes': len(value), 'sha256': sha(value)} for i, value in enumerate(parts)]}
        if mutate_manifest:
            mutate_manifest(manifest)
        if corrupt_part:
            parts[1] = bytes([parts[1][0] ^ 1]) + parts[1][1:]
        names = ['evidence', 'part-one', 'part-two']
        entries = [
            {'_temp/installer-application/RESULT.json': assembly_bytes, '_temp/installer-transport/transport-manifest.json': encode(manifest)},
            {name + '.0001.part': parts[0]},
            {name + '.0002.part': parts[1]},
        ]
        artifacts = []
        for i, (role, content) in enumerate(zip(names, entries)):
            folder = base / role
            folder.mkdir()
            target = folder / 'artifact.zip'
            with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as z:
                for entry, value in content.items():
                    z.writestr(entry, value)
            outer = target.read_bytes()
            artifacts.append({'role': role, 'file': role + '/artifact.zip', 'metadata': {
                'id': 101 + i, 'name': {'evidence': 'installer-application-evidence-r78', 'part-one': 'installer-application-part1-r78', 'part-two': 'installer-application-part2-r78'}[role],
                'size_in_bytes': len(outer), 'digest': 'sha256:' + sha(outer), 'expired': False,
                'workflow_run': {'id': 400, 'head_sha': 'a' * 40}}})
        pins = {'schema': 1, 'repository': 'Lance-QwQ/DSH-SEP', 'runId': 400,
                'sourceCommit': 'a' * 40, 'artifactPrefix': 'installer-application', 'artifacts': artifacts}
        return base, pins, data

    def rejects(self, base, pins, code):
        with self.assertRaisesRegex(ValueError, code):
            MODULE.verify_distribution(pins, base)
        self.assertFalse((base / 'verified-package' / 'DOWNLOAD-VERIFIED.json').exists())

    def test_exact_outer_parts_and_whole_archive_are_verified_without_extraction(self):
        base, pins, expected = self.fixture()
        result = MODULE.verify_distribution(pins, base)
        self.assertEqual(result['status'], 'pass')
        self.assertEqual(result['sha256'], sha(expected))
        self.assertEqual(result['bytes'], len(expected))
        self.assertEqual(Path(result['archive']).read_bytes(), expected)
        self.assertEqual([p['artifactId'] for p in result['parts']], [102, 103])
        self.assertFalse((base / 'verified-package' / 'DSH SEP.app').exists())
        self.assertEqual(result['macOSExecution'], 'not_run')

    def test_incorrect_outer_digest_is_rejected_before_publication(self):
        base, pins, _ = self.fixture()
        pins['artifacts'][1]['metadata']['digest'] = 'sha256:' + '0' * 64
        self.rejects(base, pins, 'SEP_DISTRIBUTION_OUTER')

    def test_artifact_from_another_run_is_rejected(self):
        base, pins, _ = self.fixture()
        pins['artifacts'][2]['metadata']['workflow_run']['id'] = 401
        self.rejects(base, pins, 'SEP_DISTRIBUTION_METADATA')

    def test_unknown_digest_cannot_be_inferred_from_the_download(self):
        base, pins, _ = self.fixture()
        pins['artifacts'][0]['metadata']['digest'] = None
        self.rejects(base, pins, 'SEP_DISTRIBUTION_METADATA')

    def test_manifest_must_bind_original_assembly_bytes(self):
        base, pins, _ = self.fixture(lambda m: m.update(assemblyResultSha256='f' * 64))
        self.rejects(base, pins, 'SEP_DISTRIBUTION_MANIFEST')

    def test_part_names_cannot_escape_the_fixed_archive_contract(self):
        base, pins, _ = self.fixture(lambda m: m['parts'][0].update(name='../outside.part'))
        self.rejects(base, pins, 'SEP_DISTRIBUTION_MANIFEST')

    def test_changed_part_is_rejected_even_when_outer_zip_metadata_matches(self):
        base, pins, _ = self.fixture(corrupt_part=True)
        self.rejects(base, pins, 'SEP_DISTRIBUTION_PART')

    def test_wrong_whole_digest_cannot_pass_by_matching_part_hashes(self):
        base, pins, _ = self.fixture(wrong_whole=True)
        self.rejects(base, pins, 'SEP_DISTRIBUTION_WHOLE')

    def test_existing_output_is_never_overwritten(self):
        base, pins, _ = self.fixture()
        target = base / 'verified-package'
        target.mkdir()
        sentinel = target / 'keep.txt'
        sentinel.write_bytes(b'existing output')
        self.rejects(base, pins, 'SEP_DISTRIBUTION_OUTPUT')
        self.assertEqual(sentinel.read_bytes(), b'existing output')


if __name__ == '__main__':
    unittest.main(verbosity=2)
