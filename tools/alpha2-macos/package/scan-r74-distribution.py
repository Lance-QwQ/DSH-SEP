"""One fixed archive, read-only bounded name/text inspection. Never extracts files."""
import collections
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

ROOT = Path(r'D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1')
ARCHIVE = ROOT / 'application-r74-distribution/verified-package/DSH-SEP-macOS-Alpha2-project-preview.zip'
OUTPUT = ROOT / 'application-r74-distribution/privacy-scan-r1'
EXPECTED = '20dd042cdf53752e0ce4f6c93ae919bf895c844f0772cdf9f5b881b29b654107'
EXPECTED_BYTES = 647532416
FILE_LIMIT, TOTAL_LIMIT = 512 * 1024, 128 * 1024 * 1024
TEXT_EXTENSIONS = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.jsonl', '.md', '.txt', '.yml', '.yaml', '.ini', '.cfg', '.conf', '.toml', '.env', '.sh', '.ps1', '.py', '.plist', '.xml', '.html', '.css'}
PATTERNS = {
    'private-key-header': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'provider-token-like': re.compile(r'(?<![A-Za-z0-9])sk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{20,}'),
    'github-token-like': re.compile(r'(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
    'known-personal-home-prefix': re.compile(r'C:[/\\]+Users[/\\]+(?:23849|Administrator)(?:[/\\]+)', re.I),
    'local-build-root-prefix': re.compile(r'D:[/\\]+AIData[/\\]+ProjectWork[/\\]+DSH(?:[/\\]+)', re.I),
    'runner-build-prefix': re.compile(r'(?:/Users/runner/|/home/runner/|/opt/hostedtoolcache/|D:[/\\]+a[/\\]+)', re.I),
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def identity(path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or path.resolve() != path:
        raise RuntimeError('SCAN_INPUT_IDENTITY')
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def main():
    before = identity(ARCHIVE)
    if before[2] != EXPECTED_BYTES or digest(ARCHIVE) != EXPECTED:
        raise RuntimeError('SCAN_INPUT_HASH')
    if OUTPUT.exists() or OUTPUT.parent.resolve() != OUTPUT.parent:
        raise RuntimeError('SCAN_OUTPUT')
    counters, skipped, hits, names = collections.Counter(), collections.Counter(), [], []
    scanned_bytes = 0
    with zipfile.ZipFile(ARCHIVE) as archive:
        entries = archive.infolist()
        if len({x.filename for x in entries}) != len(entries):
            raise RuntimeError('SCAN_DUPLICATE_ENTRY')
        counters['archiveEntries'] = len(entries)
        counters['uncompressedBytes'] = sum(x.file_size for x in entries)
        # First inspect the product-owned runtime, then every other name sorted.
        entries.sort(key=lambda x: (0 if '/Resources/product/runtime/' in x.filename else 1, x.filename))
        for entry in entries:
            p = PurePosixPath(entry.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in entry.filename:
                raise RuntimeError('SCAN_ENTRY_PATH')
            if entry.is_dir():
                counters['directories'] += 1
                continue
            base = p.name.lower()
            kind = None
            if base == '.env' or (base.startswith('.env.') and not any(w in base for w in ('example', 'sample', 'template', 'test'))):
                kind = 'environment-file-name'
            elif base in ('id_rsa', 'id_ed25519', 'id_ecdsa', 'credentials.json', 'auth.json', 'secrets.json') or p.suffix.lower() in ('.p12', '.pfx', '.key'):
                kind = 'credential-file-name'
            elif re.fullmatch(r'(?:session(?:\.v[0-9]+)?\.jsonl|session\.json|budget-ledger\.json|ledger\.json)', base):
                kind = 'possible-runtime-state-name'
            if kind:
                names.append({'entry': entry.filename, 'category': kind, 'bytes': entry.file_size})
            mode = (entry.external_attr >> 16) & 0xffff
            if stat.S_ISLNK(mode):
                skipped['symlinkEntries'] += 1
                continue
            if p.suffix.lower() not in TEXT_EXTENSIONS and base not in ('license', 'readme', '.env'):
                skipped['nonTextEntries'] += 1
                skipped['nonTextBytes'] += entry.file_size
                continue
            if entry.file_size > FILE_LIMIT:
                skipped['largeTextEntries'] += 1
                skipped['largeTextBytes'] += entry.file_size
                continue
            if scanned_bytes + entry.file_size > TOTAL_LIMIT:
                skipped['textBudgetEntries'] += 1
                skipped['textBudgetBytes'] += entry.file_size
                continue
            with archive.open(entry) as stream:
                raw = stream.read(FILE_LIMIT + 1)
            if len(raw) != entry.file_size or len(raw) > FILE_LIMIT:
                raise RuntimeError('SCAN_ENTRY_SIZE')
            try:
                content = raw.decode('utf-8-sig')
            except UnicodeDecodeError:
                skipped['nonUtf8Entries'] += 1
                skipped['nonUtf8Bytes'] += len(raw)
                continue
            counters['textEntries'] += 1
            scanned_bytes += len(raw)
            matches = {name: len(regex.findall(content)) for name, regex in PATTERNS.items()}
            matches = {k: v for k, v in matches.items() if v}
            if matches:
                hits.append({'entry': entry.filename, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'matches': matches})
    if before != identity(ARCHIVE) or digest(ARCHIVE) != EXPECTED:
        raise RuntimeError('SCAN_INPUT_CHANGED')
    counters['textBytes'] = scanned_bytes
    result = {
        'schema': 1, 'status': 'pass', 'scope': 'Read-only fixed ZIP name inventory and bounded UTF-8 text pattern inspection; no extraction or execution',
        'archive': {'name': ARCHIVE.name, 'sha256': EXPECTED, 'bytes': EXPECTED_BYTES},
        'limits': {'perTextEntryBytes': FILE_LIMIT, 'totalTextBytes': TOTAL_LIMIT, 'textExtensions': sorted(TEXT_EXTENSIONS)},
        'coverage': dict(counters), 'skipped': dict(skipped), 'nameCandidates': names, 'textCandidates': hits,
        'inputUnchanged': True, 'comprehensivePrivacyAudit': False, 'noPrivateDataClaim': False,
        'limitations': ['Binary and ASAR contents were not inspected', 'Oversized, non-UTF8 and budget-excluded text was not inspected', 'Pattern candidates require contextual classification; matches do not prove usable credentials', 'Absence of a match does not prove absence of private data', 'This is the r74 application ZIP, not a later installer ZIP'],
    }
    OUTPUT.mkdir(mode=0o700)
    (OUTPUT / 'RESULT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'pass', 'coverage': dict(counters), 'skipped': dict(skipped), 'nameCandidateCount': len(names), 'textCandidateCount': len(hits)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
