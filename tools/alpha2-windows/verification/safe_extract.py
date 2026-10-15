"""Create-only ZIP extraction for trusted, isolated Windows acceptance directories.

Archive member policy derives from archive-install-validation-extract.py
(SHA256 94bffe1b90bf71ebeda343e910ec1f939750ac7beca7acf9d580623ef48d0df).
This is a validation operator, not a same-user hostile-process sandbox.
Rejected/partial output is retained. No existing directory is removed.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import unicodedata
import zipfile

WORK_ROOT = Path(r'D:\AIData\ProjectWork\DSH\alpha2-windows-packages-20261015-r1')
RESERVED = re.compile(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', re.I)

class ExtractionError(RuntimeError):
    pass

def fail(code):
    raise ExtractionError(code)

def identity(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns, value.st_nlink)

def open_identity(value):
    # This bundled Windows Python exposes different ctime semantics for lstat
    # and fstat. Compare ctime before/after within each source, not across them.
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_nlink)

def alias(value):
    return stat.S_ISLNK(value.st_mode) or bool(getattr(value, 'st_file_attributes', 0) & 0x400)

def io_path(path):
    # Policy checks retain ordinary absolute paths. Win32 extended syntax is
    # used only for filesystem calls after those paths have been validated;
    # it does not relax ZIP member names or permit caller-provided devices.
    return Path('\\\\?\\' + str(path)) if os.name == 'nt' else path

def checked_parent(path, code):
    if not path.is_absolute() or not path.is_relative_to(WORK_ROOT):
        fail('ZIP_WORK_ROOT')
    parent = path.parent
    if io_path(parent).resolve(strict=True) != io_path(parent):
        fail(code)
    current = parent
    while True:
        value = io_path(current).lstat()
        if alias(value) or not stat.S_ISDIR(value.st_mode):
            fail(code)
        if current == WORK_ROOT:
            break
        if current == current.parent:
            fail('ZIP_WORK_ROOT')
        current = current.parent
    return identity(io_path(parent).stat())[:2]

def fd_hash(stream):
    stream.seek(0)
    result = hashlib.sha256()
    for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
        result.update(block)
    stream.seek(0)
    return result.hexdigest()

def validated_members(z):
    rows = z.infolist()
    if len(rows) > 250000:
        fail('ZIP_MEMBER_LIMIT')
    explicit = set()
    nodes = {}
    total = 0
    for row in rows:
        name = row.filename
        if name != row.orig_filename or not name or any(ord(c) < 32 for c in name) or any(c in name for c in '\\:<>?"|*') or name.startswith('/'):
            fail('ZIP_MEMBER_PATH')
        stripped = name[:-1] if name.endswith('/') else name
        parts = stripped.split('/')
        if any(not p or p in ('.', '..') or p.endswith(('.', ' ')) or RESERVED.match(p) for p in parts):
            fail('ZIP_MEMBER_PATH')
        if any(p.casefold() in ('.git', '.env', '.test-home') for p in parts):
            fail('ZIP_PRIVATE_ENTRY')
        folded = unicodedata.normalize('NFC', stripped).casefold()
        if folded in explicit:
            fail('ZIP_DUPLICATE_MEMBER')
        explicit.add(folded)
        mode = (row.external_attr >> 16) & 0o170000
        is_dir = row.is_dir()
        if mode not in (0, stat.S_IFREG, stat.S_IFDIR) or (mode == stat.S_IFDIR and not is_dir) or (mode == stat.S_IFREG and is_dir) or (is_dir and row.file_size):
            fail('ZIP_MEMBER_TYPE')
        if row.flag_bits & 1:
            fail('ZIP_MEMBER_ENCRYPTED')
        if row.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            fail('ZIP_MEMBER_COMPRESSION')
        if row.file_size < 0 or row.file_size > 2147483648:
            fail('ZIP_MEMBER_LIMIT')
        total += row.file_size
        if total > 16 * 1024 ** 3:
            fail('ZIP_ARCHIVE_LIMIT')
        for index in range(len(parts)):
            original = '/'.join(parts[:index+1])
            key = unicodedata.normalize('NFC', original).casefold()
            kind = 'dir' if index < len(parts)-1 or is_dir else 'file'
            previous = nodes.get(key)
            if previous and previous[1] != kind:
                fail('ZIP_MEMBER_CONFLICT')
            if previous and previous[0] != original:
                fail('ZIP_DIRECTORY_ALIAS')
            nodes[key] = (original, kind)
    return rows, total

def extract_archive(archive, expected_sha256, destination, report_path):
    archive, destination, report_path = map(Path, (archive, destination, report_path))
    if not re.fullmatch('[a-f0-9]{64}', expected_sha256):
        fail('ZIP_ARGUMENTS')
    if archive.suffix != '.zip':
        fail('ZIP_UNSEALED_ARCHIVE')
    checked_parent(archive, 'ZIP_ARCHIVE_IDENTITY')
    dest_parent = checked_parent(destination, 'ZIP_DESTINATION_ALIAS')
    report_parent = checked_parent(report_path, 'ZIP_REPORT_ALIAS')
    if destination.exists() or destination.is_symlink():
        fail('ZIP_DESTINATION_EXISTS')
    if report_path.exists() or report_path.is_symlink():
        fail('ZIP_REPORT_EXISTS')
    before = archive.lstat()
    if alias(before) or not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        fail('ZIP_ARCHIVE_IDENTITY')
    if archive == report_path or destination == report_path or archive.is_relative_to(destination) or report_path.is_relative_to(destination):
        fail('ZIP_OUTPUT_OVERLAP')
    try:
        with archive.open('rb') as source:
            opened = os.fstat(source.fileno())
            if open_identity(opened) != open_identity(before):
                fail('ZIP_ARCHIVE_IDENTITY')
            if fd_hash(source) != expected_sha256:
                fail('ZIP_ARCHIVE_HASH')
            with zipfile.ZipFile(source) as z:
                rows, total = validated_members(z)
                if identity(destination.parent.stat())[:2] != dest_parent or checked_parent(destination, 'ZIP_DESTINATION_ALIAS') != dest_parent:
                    fail('ZIP_DESTINATION_CHANGED')
                destination.mkdir()
                destination_id = identity(destination.lstat())[:2]
                count = 0
                for row in rows:
                    target = destination.joinpath(*row.filename.rstrip('/').split('/'))
                    target_io = io_path(target)
                    if row.is_dir():
                        target_io.mkdir(parents=True, exist_ok=True)
                        continue
                    target_io.parent.mkdir(parents=True, exist_ok=True)
                    checked_parent(target, 'ZIP_EXTRACTION_ALIAS')
                    written = 0
                    with z.open(row) as data, target_io.open('xb') as output:
                        for block in iter(lambda: data.read(4 * 1024 * 1024), b''):
                            written += len(block)
                            if written > row.file_size:
                                fail('ZIP_EXTRACTED_SIZE')
                            output.write(block)
                    if written != row.file_size or target_io.stat().st_size != written:
                        fail('ZIP_EXTRACTED_SIZE')
                    count += 1
                if identity(destination.lstat())[:2] != destination_id or alias(destination.lstat()):
                    fail('ZIP_DESTINATION_CHANGED')
            if fd_hash(source) != expected_sha256 or identity(os.fstat(source.fileno())) != identity(opened) or identity(archive.lstat()) != identity(before):
                fail('ZIP_ARCHIVE_CHANGED')
        if checked_parent(report_path, 'ZIP_REPORT_ALIAS') != report_parent:
            fail('ZIP_REPORT_CHANGED')
        report = {'schema': 1, 'status': 'pass', 'archive': str(archive), 'archiveSha256': expected_sha256, 'archiveBytes': before.st_size, 'destination': str(destination), 'members': len(rows), 'regularFiles': count, 'uncompressedBytes': total, 'scope': 'Untrusted ZIP members in an isolated, trusted destination; actual manifest binding is a separate required check. Not protection against a hostile same-user process.'}
        with report_path.open('x', encoding='utf8', newline='\n') as output:
            json.dump(report, output, indent=2, ensure_ascii=False)
            output.write('\n')
        return report
    except (zipfile.BadZipFile, RuntimeError) as error:
        if isinstance(error, ExtractionError):
            raise
        raise ExtractionError('ZIP_CONTENT_INVALID') from error

if __name__ == '__main__':
    try:
        if len(sys.argv) != 5:
            fail('ZIP_ARGUMENTS')
        result = extract_archive(*sys.argv[1:])
        print(json.dumps({'status': result['status'], 'regularFiles': result['regularFiles'], 'archiveSha256': result['archiveSha256']}))
    except ExtractionError as error:
        print(json.dumps({'status': 'fail', 'code': str(error)}), file=sys.stderr)
        sys.exit(1)
