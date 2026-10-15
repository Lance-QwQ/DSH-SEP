"""Local transport verifier. No download, extraction, signing or execution.

Pins must contain actual GitHub artifact API metadata captured by the operator.
That metadata is the external trust input; this tool never invents a missing hash.
The public CLI writes only to the fixed r78 installer distribution directory on D:.
"""
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

DEFAULT_ROOT = Path('D:/AIData/ProjectWork/DSH/alpha2-macos-package-20261014-r1/installer-r78-distribution')
ROLES = ('evidence', 'part-one', 'part-two')
CHUNK = 1024 * 1024
MAX_OUTER = 2 * 1024**3
MAX_PART = 384 * 1024**2
HEX = re.compile(r'[a-f0-9]{64}\Z')


def require(condition, suffix):
    if not condition:
        raise ValueError('SEP_DISTRIBUTION_' + suffix)


def exact_keys(value, names, suffix):
    require(type(value) is dict and set(value) == set(names), suffix)


def positive(value, maximum=MAX_OUTER):
    return type(value) is int and 0 < value <= maximum


def fingerprint(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns,
            value.st_ctime_ns, getattr(value, 'st_birthtime_ns', None))


def same_object(path_stat, fd_stat):
    # On this Windows Python runtime lstat and fstat can report different ctime
    # values for the same inode. Compare common identity fields here, then keep
    # each API's full time fingerprint unchanged across the entire operation.
    keys = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_birthtime_ns')
    return all(getattr(path_stat, key, None) == getattr(fd_stat, key, None) for key in keys)


def regular(path):
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and not path.is_symlink()
            and before.st_nlink == 1 and path.resolve(strict=True) == path, 'BINDING')
    return before


def file_hash(handle):
    handle.seek(0)
    result = hashlib.sha256()
    for block in iter(lambda: handle.read(CHUNK), b''):
        result.update(block)
    handle.seek(0)
    return result.hexdigest()


def parse_json(data, suffix):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, suffix)
            result[key] = value
        return result
    try:
        return json.loads(data.decode('utf-8'), object_pairs_hook=unique)
    except (UnicodeError, json.JSONDecodeError):
        raise ValueError('SEP_DISTRIBUTION_' + suffix) from None


def read_entry(archive, name):
    names = archive.namelist()
    require(len(names) == len(set(names)) and names.count(name) == 1, 'ZIP')
    entry = archive.getinfo(name)
    require(not entry.is_dir() and 0 < entry.file_size <= CHUNK, 'ZIP')
    data = archive.read(entry)
    require(len(data) == entry.file_size, 'ZIP')
    return data


def verify_distribution(pins, base):
    """Verify real outer ZIPs and reconstruct the inner ZIP into a fresh directory.

    `base` is an internal local-operator argument; the CLI fixes it to DEFAULT_ROOT.
    Tests use isolated synthetic subdirectories. No ZIP entry is extracted.
    """
    base = Path(base).absolute()
    require(base.resolve(strict=True) == base and base.is_dir(), 'OUTPUT')
    exact_keys(pins, ('schema', 'repository', 'runId', 'sourceCommit', 'artifactPrefix', 'artifacts'), 'METADATA')
    require(pins['schema'] == 1 and pins['repository'] == 'Lance-QwQ/DSH-SEP'
            and positive(pins['runId'], 10**15)
            and re.fullmatch(r'[a-f0-9]{40}', pins['sourceCommit'] or '')
            and pins['artifactPrefix'] == 'installer-application', 'METADATA')
    require(type(pins['artifacts']) is list and len(pins['artifacts']) == 3, 'METADATA')
    out = base / 'verified-package'
    require(not out.exists() and not out.is_symlink(), 'OUTPUT')
    by_role, identities, opened = {}, [], []
    with ExitStack() as stack:
        for expected_role, row in zip(ROLES, pins['artifacts']):
            exact_keys(row, ('role', 'file', 'metadata'), 'METADATA')
            require(row['role'] == expected_role, 'METADATA')
            meta = row['metadata']
            require(type(meta) is dict and positive(meta.get('id'), 10**15)
                    and meta.get('name') == {'evidence': 'installer-application-evidence-r78', 'part-one': 'installer-application-part1-r78', 'part-two': 'installer-application-part2-r78'}[expected_role]
                    and positive(meta.get('size_in_bytes')) and meta.get('expired') is False
                    and re.fullmatch(r'sha256:[a-f0-9]{64}', meta.get('digest') or '')
                    and type(meta.get('workflow_run')) is dict
                    and meta['workflow_run'].get('id') == pins['runId']
                    and meta['workflow_run'].get('head_sha') == pins['sourceCommit'], 'METADATA')
            relative = row['file']
            require(type(relative) is str and '\\' not in relative and ':' not in relative
                    and relative == str(PurePosixPath(relative)) and not relative.startswith('/')
                    and all(p not in ('', '.', '..') for p in relative.split('/')), 'METADATA')
            path = base.joinpath(*relative.split('/'))
            before = regular(path)
            require(before.st_size == meta['size_in_bytes'], 'OUTER')
            handle = stack.enter_context(path.open('rb'))
            fd_before = os.fstat(handle.fileno())
            require(same_object(before, fd_before), 'BINDING')
            require(file_hash(handle) == meta['digest'][7:], 'OUTER')
            archive = stack.enter_context(zipfile.ZipFile(handle))
            by_role[expected_role] = {'zip': archive, 'metadata': meta, 'path': path}
            identities.append((path, handle, fingerprint(before), fingerprint(fd_before)))
            opened.append(meta['id'])
        require(len(set(opened)) == 3, 'METADATA')

        assembly_bytes = read_entry(by_role['evidence']['zip'], '_temp/installer-application/RESULT.json')
        assembly = parse_json(assembly_bytes, 'ASSEMBLY')
        manifest_bytes = read_entry(by_role['evidence']['zip'], '_temp/installer-transport/transport-manifest.json')
        manifest = parse_json(manifest_bytes, 'MANIFEST')
        require(type(assembly) is dict and assembly.get('status') == 'pass'
                and assembly.get('sourceCommit') == pins['sourceCommit']
                and assembly.get('artifact') == 'DSH-SEP-macOS-Alpha2-installer-preview.zip'
                and positive(assembly.get('artifactBytes')) and HEX.fullmatch(assembly.get('artifactSha256') or ''), 'ASSEMBLY')
        require(type(manifest) is dict and manifest.get('schema') == 1 and manifest.get('status') == 'pass'
                and manifest.get('assemblyResultSha256') == hashlib.sha256(assembly_bytes).hexdigest()
                and manifest.get('artifact') == {'name': assembly['artifact'], 'bytes': assembly['artifactBytes'], 'sha256': assembly['artifactSha256']}
                and manifest.get('totalBytes') == assembly['artifactBytes']
                and positive(manifest.get('partBytes'), MAX_PART)
                and type(manifest.get('parts')) is list and len(manifest['parts']) == 2, 'MANIFEST')
        for index, part in enumerate(manifest['parts'], 1):
            exact_keys(part, ('index', 'name', 'bytes', 'sha256'), 'MANIFEST')
            require(type(part['index']) is int and part['index'] == index
                    and part['name'] == assembly['artifact'] + f'.{index:04}.part'
                    and positive(part['bytes'], manifest['partBytes']) and HEX.fullmatch(part['sha256'] or ''), 'MANIFEST')
            if index == 1:
                require(part['bytes'] == manifest['partBytes'], 'MANIFEST')
        require(sum(p['bytes'] for p in manifest['parts']) == assembly['artifactBytes'], 'MANIFEST')

        # Preflight completes before creating output. Failure after this point leaves
        # unverified bytes in this fresh directory; no success receipt is published.
        out.mkdir(mode=0o700)
        require(out.resolve(strict=True) == out, 'OUTPUT')
        target = out / assembly['artifact']
        total, whole, part_receipts = 0, hashlib.sha256(), []
        with target.open('xb') as combined:
            for role, part in zip(ROLES[1:], manifest['parts']):
                archive = by_role[role]['zip']
                require(archive.namelist().count(part['name']) == 1, 'ZIP')
                entry = archive.getinfo(part['name'])
                require(not entry.is_dir() and entry.file_size == part['bytes'], 'PART')
                count, digest = 0, hashlib.sha256()
                with archive.open(entry) as source:
                    for data in iter(lambda: source.read(CHUNK), b''):
                        count += len(data)
                        total += len(data)
                        require(count <= part['bytes'] and total <= assembly['artifactBytes'], 'PART')
                        require(combined.write(data) == len(data), 'IO')
                        digest.update(data)
                        whole.update(data)
                require(count == part['bytes'] and digest.hexdigest() == part['sha256'], 'PART')
                part_receipts.append({**part, 'artifactId': by_role[role]['metadata']['id'],
                                      'outerSha256': by_role[role]['metadata']['digest'][7:]})
            combined.flush()
            os.fsync(combined.fileno())
        require(total == assembly['artifactBytes'] and whole.hexdigest() == assembly['artifactSha256'], 'WHOLE')
        for path, handle, path_before, fd_before in identities:
            current_path, current_fd = regular(path), os.fstat(handle.fileno())
            require(path_before == fingerprint(current_path) and fd_before == fingerprint(current_fd)
                    and same_object(current_path, current_fd), 'BINDING')
        with target.open('rb') as readback:
            require(file_hash(readback) == assembly['artifactSha256'], 'WHOLE')

    result = {'schema': 1, 'status': 'pass',
              'scope': 'Local artifact transport and exact archive byte reconstruction only; no extraction, signing or installation',
              'repository': pins['repository'], 'runId': pins['runId'], 'sourceCommit': pins['sourceCommit'],
              'metadataSource': 'operator-supplied actual GitHub artifact API metadata; no independent network lookup',
              'outerArtifacts': [{**row['metadata'], 'file': row['file']} for row in pins['artifacts']],
              'assemblyResultSha256': hashlib.sha256(assembly_bytes).hexdigest(),
              'transportManifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
              'archive': str(target), 'bytes': total, 'sha256': whole.hexdigest(), 'parts': part_receipts,
              'macOSExecution': 'not_run', 'macOSSignatureVerification': 'not_run', 'actualUIValidation': 'not_run'}
    for name, data in (('SOURCE-ASSEMBLY.json', assembly_bytes), ('transport-manifest.json', manifest_bytes)):
        with (out / name).open('xb') as handle:
            handle.write(data)
    with (out / 'DOWNLOAD-VERIFIED.json').open('x', encoding='utf-8') as handle:
        json.dump(result, handle, indent=2)
        handle.write('\n')
    return result


if __name__ == '__main__':
    try:
        require(len(sys.argv) == 2 and os.name == 'nt', 'ARGUMENT')
        root = DEFAULT_ROOT.absolute()
        require(root.resolve(strict=True) == root, 'OUTPUT')
        pins_path = Path(sys.argv[1]).absolute()
        require(pins_path.parent == root and regular(pins_path).st_size <= CHUNK, 'ARGUMENT')
        result = verify_distribution(parse_json(pins_path.read_bytes(), 'METADATA'), root)
        print(json.dumps({'status': 'pass', 'archive': result['archive'], 'bytes': result['bytes'], 'sha256': result['sha256']}))
    except Exception as error:
        text = str(error)
        print(json.dumps({'status': 'fail', 'code': text if re.fullmatch(r'SEP_DISTRIBUTION_[A-Z_]{1,40}', text) else 'SEP_DISTRIBUTION_IO'}), file=sys.stderr)
        sys.exit(1)
