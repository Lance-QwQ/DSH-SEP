"""Exact local operator derivation. No real artifact metadata or results are generated."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parent
PINS = {
    'verify-application-distribution.py': 'a8875649f3968b6959767319de5e9d05de5ebce07afde36ae37ffa7d2f94b6b0',
    'verify-application-distribution.test.py': 'ccee174336fb214c0b010d00f2ec2e2b41165e19af3278b1abc4039bb1d0c82f',
    'scan-r74-distribution.py': 'bbe191e1751304d5f02a921f0b8553fe5202009e4ed66ba768decf8726d39c09',
}
ORIGINS = []

def derive(source, target, changes):
    raw = (ROOT / source).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == PINS[source]
    text, rows = raw.decode('utf-8'), []
    for old, new, count in changes:
        assert text.count(old) == count, (target, old, text.count(old), count)
        text = text.replace(old, new)
        rows.append({'from': old, 'to': new, 'occurrences': count})
    result = text.encode()
    ORIGINS.append({'source': source, 'sourceSha256': PINS[source], 'result': target, 'resultSha256': hashlib.sha256(result).hexdigest(), 'transformations': rows})
    (ROOT / target).write_bytes(result)

derive('verify-application-distribution.test.py', 'verify-installer-distribution.test.py', [
    ("'verify-application-distribution.py'", "'verify-installer-distribution.py'", 1),
    ("'DSH-SEP-macOS-Alpha2-project-preview.zip'", "'DSH-SEP-macOS-Alpha2-installer-preview.zip'", 1),
    ("{'project-build/RESULT.json': assembly_bytes},\n            {'transport-manifest.json': encode(manifest), name + '.0001.part': parts[0]}", "{'_temp/installer-application/RESULT.json': assembly_bytes, '_temp/installer-transport/transport-manifest.json': encode(manifest)},\n            {name + '.0001.part': parts[0]}", 1),
    ("'name': 'project-application-r74-' + role", "'name': {'evidence': 'installer-application-evidence-r78', 'part-one': 'installer-application-part1-r78', 'part-two': 'installer-application-part2-r78'}[role]", 1),
    ("'artifactPrefix': 'project-application-r74'", "'artifactPrefix': 'installer-application'", 1),
])

if sys.argv[1:] == ['--tests-only']:
    # TDD fixture only, before the derived implementation is produced.
    (ROOT / 'verify-installer-distribution.py').write_text("def verify_distribution(pins, base):\n    raise NotImplementedError('Installer distribution adapter not implemented')\n", encoding='utf-8')
    print('Prepared nine inherited behavior definitions and explicit implementation stub')
    sys.exit(0)
assert sys.argv[1:] == []

derive('verify-application-distribution.py', 'verify-installer-distribution.py', [
    ('fixed r74 distribution directory', 'fixed r78 installer distribution directory', 1),
    ('/application-r74-distribution', '/installer-r78-distribution', 1),
    ("and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,120}', pins['artifactPrefix'] or '')", "and pins['artifactPrefix'] == 'installer-application'", 1),
    ("meta.get('name') == pins['artifactPrefix'] + '-' + expected_role", "meta.get('name') == {'evidence': 'installer-application-evidence-r78', 'part-one': 'installer-application-part1-r78', 'part-two': 'installer-application-part2-r78'}[expected_role]", 1),
    ("'project-build/RESULT.json'", "'_temp/installer-application/RESULT.json'", 1),
    ("read_entry(by_role['part-one']['zip'], 'transport-manifest.json')", "read_entry(by_role['evidence']['zip'], '_temp/installer-transport/transport-manifest.json')", 1),
    ("and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,199}\\.zip', assembly.get('artifact') or '')", "and assembly.get('artifact') == 'DSH-SEP-macOS-Alpha2-installer-preview.zip'", 1),
])

derive('scan-r74-distribution.py', 'scan-installer-distribution.py', [
    ("ARCHIVE = ROOT / 'application-r74-distribution/verified-package/DSH-SEP-macOS-Alpha2-project-preview.zip'", "ARCHIVE = ROOT / 'installer-r78-distribution/verified-package/DSH-SEP-macOS-Alpha2-installer-preview.zip'", 1),
    ("OUTPUT = ROOT / 'application-r74-distribution/privacy-scan-r1'", "OUTPUT = ROOT / 'installer-r78-distribution/privacy-scan-r1'", 1),
    ("EXPECTED = '20dd042cdf53752e0ce4f6c93ae919bf895c844f0772cdf9f5b881b29b654107'\nEXPECTED_BYTES = 647532416", "RECORD = ROOT / 'installer-r78-distribution/verified-package/DOWNLOAD-VERIFIED.json'\nEXPECTED, EXPECTED_BYTES = None, None", 1),
    ("def main():\n    before = identity(ARCHIVE)", "def main():\n    global EXPECTED, EXPECTED_BYTES\n    record_before = identity(RECORD)\n    if not 0 < record_before[2] <= 1048576:\n        raise RuntimeError('SCAN_RECORD')\n    record_bytes = RECORD.read_bytes()\n    record = json.loads(record_bytes)\n    if record.get('schema') != 1 or record.get('status') != 'pass' or record.get('archive') != str(ARCHIVE) or not re.fullmatch(r'[a-f0-9]{40}', record.get('sourceCommit', '')) or not re.fullmatch(r'[a-f0-9]{64}', record.get('sha256', '')) or type(record.get('bytes')) is not int or not 0 < record['bytes'] <= 2 * 1024**3:\n        raise RuntimeError('SCAN_RECORD')\n    EXPECTED, EXPECTED_BYTES = record['sha256'], record['bytes']\n    before = identity(ARCHIVE)", 1),
    ("'This is the r74 application ZIP, not a later installer ZIP'", "'This inspects only the exact installer ZIP bound to the supplied verified download record; no native execution or full privacy certification'", 1),
    ("    OUTPUT.mkdir(mode=0o700)", "    if record_before != identity(RECORD) or record_bytes != RECORD.read_bytes():\n        raise RuntimeError('SCAN_RECORD_CHANGED')\n    result['downloadRecordSha256'] = hashlib.sha256(record_bytes).hexdigest()\n    result['sourceCommit'] = record['sourceCommit']\n    OUTPUT.mkdir(mode=0o700)", 1),
])
(ROOT / 'INSTALLER-DISTRIBUTION-ORIGINS.json').write_text(json.dumps({'schema': 1, 'status': 'prepared', 'scope': 'Only local transport/scan adapter byte derivation; no real downloaded-artifact result', 'origins': ORIGINS}, indent=2) + '\n', encoding='utf-8')
print('Prepared fixed r78 transport adapter and download-bound bounded scanner; no actual artifacts read')
