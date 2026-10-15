"""Read-only, bounded program-distribution inspection; never a universal secret claim."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import zipfile
import gzip
import tarfile

RULES = {k: re.compile(v) for k, v in {
    'windows-home': rb'(?i)[a-z]:[\\/]+Users[\\/]+[^\\/\s"\']{1,128}',
    'posix-home': rb'/(?:Users|home)/[A-Za-z0-9_.-]{1,128}',
    'absolute-file-url': rb'file:(?:/{1,3}|\\{1,3})[A-Za-z]:',
    'local-build-root': rb'(?i)[a-z]:[\\/]+AIData[\\/]',
    'github-token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,200}|github_pat_[A-Za-z0-9_]{40,255})',
    'provider-key': rb'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{32,200}',
    'aws-access-key': rb'(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])',
    'private-key-header': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
}.items()}
INLINE_MAP = re.compile(rb'sourceMappingURL=data:application/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)')
HEX = re.compile(r'^[a-f0-9]{64}$')
TEXT_SUFFIXES = {'.json', '.map', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html', '.md', '.txt', '.yml', '.yaml'}
DECODE_SUFFIXES = {'.json', '.map', '.js', '.mjs', '.cjs', '.css'}

def load_json_comments(data):
    text = data.decode('utf-8-sig'); out=[]; i=0; quoted=False
    while i < len(text):
        char=text[i]
        if quoted:
            out.append(char); i+=1
            if char=='\\' and i<len(text):out.append(text[i]);i+=1
            elif char=='"':quoted=False
        elif char=='"':quoted=True;out.append(char);i+=1
        elif text.startswith('//',i):
            end=text.find('\n',i);i=len(text) if end<0 else end
        elif text.startswith('/*',i):
            end=text.find('*/',i+2)
            if end<0:raise ValueError('JSON_COMMENT')
            out.append(' ');i=end+2
        else:out.append(char);i+=1
    text=''.join(out);out=[];i=0;quoted=False
    while i<len(text):
        char=text[i]
        if quoted:
            out.append(char);i+=1
            if char=='\\' and i<len(text):out.append(text[i]);i+=1
            elif char=='"':quoted=False
        elif char=='"':quoted=True;out.append(char);i+=1
        elif char==',' and re.match(r'\s*[}\]]',text[i+1:]):i+=1
        else:out.append(char);i+=1
    return json.loads(''.join(out))

def digest_stream(stream, chunk_size=1024 * 1024):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(chunk_size), b''):
        h.update(chunk)
    return h.hexdigest()

def file_identity(st):
    # Windows path/fd stat disagree on legacy ctime; use actual birthtime there.
    return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns,
            getattr(st,'st_birthtime_ns',None) if os.name=='nt' else st.st_ctime_ns, st.st_nlink)

def safe_name(name):
    if not isinstance(name, str) or not name or len(name) > 2048 or name.startswith('/') or '\\' in name or ':' in name or any(ord(c) < 32 for c in name):
        return False
    parts = name.rstrip('/').split('/')
    return all(p not in ('', '.', '..') and p.rstrip(' .') == p for p in parts)

def state_name(name):
    p = PurePosixPath(name)
    base = p.name.lower()
    return ('.git' in [x.lower() for x in p.parts] or
            base in ('cookies', 'login data', 'local state', 'profile.json', 'credentials.json', 'auth.json', 'daily-selection.json') or
            (base.startswith('.env') and not base.endswith(('.example', '.sample', '.template'))) or
            base.endswith(('.sqlite', '.sqlite3', '.db', '.db-wal', '.db-shm', '.jsonl')))

class SliceReader:
    """Seekable view into an already-open program container; never extracts files."""
    def __init__(self, stream, offset, size):
        self.stream, self.offset, self.size, self.position = stream, offset, size, 0
    def read(self, n=-1):
        n = self.size - self.position if n < 0 else min(n, self.size - self.position)
        self.stream.seek(self.offset + self.position)
        b = self.stream.read(n)
        self.position += len(b)
        return b
    def seek(self, offset, whence=0):
        value = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        if value < 0 or value > self.size:
            raise ValueError('CONTAINER_RANGE')
        self.position = value
        return value
    def tell(self):
        return self.position
    def seekable(self):
        return True

class Scanner:
    def __init__(self, *, chunk_size=1024 * 1024, max_depth=3, max_text_bytes=16 * 1024**2,
                 max_expanded_bytes=8 * 1024**3, max_files=200000, allowlist=None):
        if chunk_size < 32 or max_depth < 0 or max_files < 1:
            raise ValueError('SCAN_LIMIT')
        self.chunk_size, self.max_depth, self.max_text_bytes = chunk_size, max_depth, max_text_bytes
        self.max_expanded_bytes, self.max_files = max_expanded_bytes, max_files
        self.allowlist = allowlist or []
        self.files, self.findings, self.gaps, self.seen = [], [], [], set()
        self.total = 0

    def finding(self, path, rule, line=None, representation='metadata'):
        key = (path, rule, line, representation)
        if key not in self.seen:
            self.seen.add(key)
            if len(self.findings) >= 50000:
                self.gap(path, 'finding-limit')
            else:
                self.findings.append({'path': path, 'rule': rule, 'line': line, 'representation': representation})

    def gap(self, path, code):
        value = {'path': path, 'code': code}
        if value not in self.gaps:
            self.gaps.append(value)

    def patterns(self, data, path, representation='raw', line_base=0):
        for rule, rx in RULES.items():
            for m in rx.finditer(data):
                self.finding(path, rule, line_base + data[:m.start()].count(b'\n') + 1, representation)

    def decoded(self, data, path):
        suffix = PurePosixPath(path).suffix.lower()
        if suffix in ('.json', '.map'):
            try:
                try:value = json.loads(data)
                except ValueError:value = load_json_comments(data)
            except (ValueError, UnicodeError, RecursionError):
                self.gap(path, 'json-decode')
                return
            stack, visited = [value], 0
            while stack:
                current = stack.pop()
                visited += 1
                if visited > 500000:
                    self.gap(path, 'json-node-limit')
                    break
                if isinstance(current, str):
                    self.patterns(current.encode('utf-8'), path, 'json-decoded')
                elif isinstance(current, dict):
                    stack.extend(current.keys()); stack.extend(current.values())
                elif isinstance(current, list):
                    stack.extend(current)
        if suffix in ('.js', '.mjs', '.cjs', '.css'):
            for match in INLINE_MAP.finditer(data):
                try:
                    decoded = base64.b64decode(match[1], validate=True)
                    if len(decoded) > self.max_text_bytes:
                        self.gap(path, 'inline-map-limit')
                    else:
                        self.patterns(decoded, path, 'inline-source-map')
                        self.decoded(decoded, path + '!inline.map')
                except (ValueError, UnicodeError):
                    self.gap(path, 'inline-map-decode')

    def stream(self, stream, size, path, depth=0, expected=None, siblings=None):
        if len(self.files) >= self.max_files or self.total + size > self.max_expanded_bytes:
            self.gap(path, 'scan-size-limit')
            return
        if state_name(path.split('!')[-1]):
            self.finding(path, 'state-artifact')
            self.files.append({'path': path, 'bytes': size, 'bodyRead': False})
            return
        suffix = PurePosixPath(path).suffix.lower()
        chunks, h, count, tail, lines = [], hashlib.sha256(), 0, b'', 0
        collect = size <= self.max_text_bytes and suffix in DECODE_SUFFIXES
        while chunk := stream.read(self.chunk_size):
            if count + len(chunk) > size:
                self.finding(path, 'source-binding')
                return
            h.update(chunk)
            data = tail + chunk
            self.patterns(data, path, line_base=lines - tail.count(b'\n'))
            if b'\0' in data:
                self.patterns(data.replace(b'\0', b''), path, 'utf16-null-normalized', lines - tail.count(b'\n'))
            if collect:
                chunks.append(chunk)
            count += len(chunk); lines += chunk.count(b'\n'); tail = data[-4096:]
        row = {'path': path, 'bytes': count, 'sha256': h.hexdigest(), 'bodyRead': True}
        self.files.append(row); self.total += count
        if count != size or expected is not None and row['sha256'] != expected:
            self.finding(path, 'source-binding')
            return
        if collect:
            self.decoded(b''.join(chunks), path)
        elif suffix in DECODE_SUFFIXES:
            self.gap(path, 'decoded-text-size-limit')
        if suffix in ('.zip', '.asar', '.gz', '.tar'):
            if depth >= self.max_depth:
                self.gap(path, 'container-depth-limit')
                return
            stream.seek(0)
            if suffix == '.zip':
                self.zip(stream, path, depth + 1)
            elif suffix == '.asar':
                self.asar(stream, size, path, depth + 1, siblings)
            elif suffix == '.tar':self.tar(stream,path,depth+1)
            else:
                try:
                    with gzip.GzipFile(fileobj=stream) as gz:data=gz.read(self.max_text_bytes+1)
                    if len(data)>self.max_text_bytes:self.gap(path,'gzip-expanded-limit')
                    else:self.stream(io.BytesIO(data),len(data),path+'!'+PurePosixPath(path).name[:-3],depth+1)
                except (OSError,EOFError,ValueError):self.gap(path,'gzip-decode')
        elif suffix in ('.7z', '.rar', '.xz', '.bz2'):
            self.gap(path, 'unsupported-container')

    def tar(self, stream, prefix, depth):
        try:
            with tarfile.open(fileobj=stream,mode='r:') as archive:
                seen=set()
                for index,item in enumerate(archive):
                    name=item.name;label=prefix+'!'+name
                    if not safe_name(name) or name.casefold() in seen or not (item.isfile() or item.isdir() or item.islnk()):
                        self.finding(prefix+'!@member-'+str(index),'unsafe-member');continue
                    seen.add(name.casefold())
                    if item.islnk():
                        if not safe_name(item.linkname):self.finding(label,'unsafe-member');continue
                        target=archive.getmember(item.linkname)
                        if not target.isfile():self.finding(label,'unsafe-member');continue
                        # Resolve only an in-archive regular member. Never extract or link on disk.
                        with archive.extractfile(target) as child:self.stream(child,target.size,label,depth)
                    if item.isfile():
                        with archive.extractfile(item) as child:self.stream(child,item.size,label,depth)
        except (tarfile.TarError,OSError,EOFError,ValueError,KeyError):self.gap(prefix,'tar-decode')

    def zip(self, stream, prefix='', depth=0):
        try:
            with zipfile.ZipFile(stream) as archive:
                seen, infos = set(), archive.infolist()
                siblings = {i.filename for i in infos}
                for index, item in enumerate(infos):
                    name = item.filename
                    label = (prefix + '!' if prefix else '') + name
                    mode = item.external_attr >> 16
                    if not safe_name(name) or name.rstrip('/').casefold() in seen or stat.S_ISLNK(mode):
                        self.finding((prefix + '!' if prefix else '') + '@member-' + str(index), 'unsafe-member')
                        continue
                    seen.add(name.rstrip('/').casefold())
                    if item.is_dir():
                        continue
                    if item.flag_bits & 1:
                        self.gap(label, 'encrypted-member')
                        continue
                    with archive.open(item) as child:
                        self.stream(child, item.file_size, label, depth, siblings=siblings)
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, ValueError):
            self.gap(prefix or '@archive', 'zip-decode-or-crc')

    def asar(self, stream, size, prefix, depth, siblings):
        try:
            head = stream.read(16)
            if len(head) != 16:
                raise ValueError('ASAR_HEADER')
            tag, header_size, payload_size, json_size = struct.unpack('<IIII', head)
            if tag != 4 or payload_size != header_size - 4 or not 0 < json_size <= self.max_text_bytes or header_size != 4 + ((4 + json_size + 3) // 4) * 4 or 8 + header_size > size:
                raise ValueError('ASAR_HEADER')
            header = json.loads(stream.read(json_size))
            base, occupied = 8 + header_size, []
            stack = [('', header, 0)]
            while stack:
                path, node, nesting = stack.pop()
                if nesting > 64 or not isinstance(node, dict):
                    raise ValueError('ASAR_TREE')
                if 'files' in node:
                    if not isinstance(node['files'], dict):
                        raise ValueError('ASAR_TREE')
                    for name, child in node['files'].items():
                        if not safe_name(name) or '/' in name:
                            raise ValueError('ASAR_NAME')
                        stack.append((path + '/' + name if path else name, child, nesting + 1))
                    continue
                label = prefix + '!' + path
                if 'link' in node:
                    self.finding(label, 'unsafe-member')
                    continue
                if node.get('unpacked') is True:
                    sibling = prefix.split('!')[-1] + '.unpacked/' + path
                    if siblings is None or sibling not in siblings:
                        self.gap(label, 'asar-unpacked-not-in-container')
                    continue
                length = node.get('size')
                offset = node.get('offset')
                if type(length) is not int or length < 0 or not isinstance(offset, str) or not offset.isdigit():
                    raise ValueError('ASAR_RANGE')
                offset = int(offset)
                if base + offset + length > size:
                    raise ValueError('ASAR_RANGE')
                if length:
                    occupied.append((offset, offset + length))
                self.stream(SliceReader(stream, base + offset, length), length, label, depth)
            occupied.sort()
            if any(a[1] > b[0] for a, b in zip(occupied, occupied[1:])):
                raise ValueError('ASAR_OVERLAP')
        except (ValueError, UnicodeError, struct.error, KeyError, RecursionError):
            self.gap(prefix, 'asar-decode')

    def result(self, **identity):
        hashes = {f['path']: f.get('sha256') for f in self.files}
        for finding in self.findings:
            finding['reviewedExactException'] = any(
                finding['rule'] in RULES and isinstance(a, dict) and a.get('path') == finding['path'] and a.get('rule') == finding['rule'] and
                a.get('line') == finding['line'] and a.get('representation') == finding['representation'] and
                isinstance(a.get('sha256'), str) and a['sha256'] == hashes.get(finding['path']) and HEX.fullmatch(a['sha256']) and
                isinstance(a.get('reason'), str) and 0 < len(a['reason']) <= 500
                for a in self.allowlist)
        unresolved = sum(not f['reviewedExactException'] for f in self.findings)
        return {'schema': 1, 'status': 'fail' if unresolved else 'blocked' if self.gaps else 'pass',
                'scope': 'Selected byte patterns, bounded JSON/JSONC and inline-source-map decoding, ZIP/packed ASAR/gzip/TAR inspection; no program execution or user-state body reads',
                'fullPrivacyAudit': 'not_run', 'noPrivateDataClaim': False,
                'identity': identity, 'scannerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'limits': {'containerDepth':self.max_depth,'decodedBytes':self.max_text_bytes,'expandedBytes':self.max_expanded_bytes,'files':self.max_files},
                'files': self.files, 'findings': self.findings, 'gaps': self.gaps,
                'scannedBytesIncludingContainerViews': self.total, 'unresolvedFindings': unresolved,
                'limitations': ['No universal secret or private-content detector', 'Binary semantics, arbitrary encodings, remote links and encrypted data are not certified',
                                'UTF-16 check removes NUL bytes for selected patterns; it is not executable analysis',
                                'Line numbers in decoded representations refer to that decoded text, not necessarily the outer file',
                                'Container dispatch uses filename extensions; unknown embedded payloads are not certified',
                                'Exact exceptions require separate human provenance review; old release exceptions are not inherited']}

def audit_bytes(data, name='program.js', **options):
    scanner = Scanner(**options)
    scanner.stream(io.BytesIO(data), len(data), name)
    return scanner.result()

def audit_zip(path, expected_sha256, **options):
    scanner = Scanner(**options)
    path = Path(path)
    before = path.lstat()
    identity = file_identity
    if not stat.S_ISREG(before.st_mode) or path.is_symlink() or before.st_nlink != 1:
        scanner.finding('@archive', 'source-binding')
        return scanner.result()
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        if identity(opened) != identity(before):
            scanner.finding('@archive', 'source-binding')
            return scanner.result()
        actual = digest_stream(stream)
        if actual != expected_sha256:
            scanner.finding('@archive', 'source-binding')
        else:
            stream.seek(0); scanner.zip(stream)
        if identity(os.fstat(stream.fileno())) != identity(before) or identity(path.lstat()) != identity(before):
            scanner.finding('@archive', 'source-binding')
    return scanner.result(archiveSha256=actual, archiveBytes=before.st_size)

def audit_graph(root, graph_sha256, descriptor_sha256, **options):
    root, scanner = Path(root).resolve(), Scanner(**options)
    graph_bytes, descriptor = (root / 'graph.json').read_bytes(), (root / 'desktop-runtime.json').read_bytes()
    if hashlib.sha256(graph_bytes).hexdigest() != graph_sha256 or hashlib.sha256(descriptor).hexdigest() != descriptor_sha256:
        scanner.finding('@manifests', 'source-binding')
        return scanner.result()
    graph = json.loads(graph_bytes)
    if graph.get('schema') != 3 or not isinstance(graph.get('files'), list):
        scanner.finding('graph.json', 'source-binding')
        return scanner.result()
    seen = set()
    for row in graph['files']:
        rel = row.get('path')
        if not safe_name(rel) or rel.casefold() in seen:
            scanner.finding('@graph-entry', 'unsafe-member'); continue
        seen.add(rel.casefold())
        path = root / rel
        if state_name(rel):
            scanner.stream(io.BytesIO(b''), row.get('size', 0), rel); continue
        before = path.lstat()
        if not stat.S_ISREG(before.st_mode) or path.is_symlink() or before.st_nlink!=1 or path.resolve() != path or before.st_size != row.get('size'):
            scanner.finding(rel, 'source-binding'); continue
        with path.open('rb') as stream:
            if file_identity(os.fstat(stream.fileno()))!=file_identity(before):
                scanner.finding(rel,'source-binding');continue
            scanner.stream(stream, before.st_size, rel, expected=row.get('sha256'))
            if file_identity(os.fstat(stream.fileno()))!=file_identity(before):scanner.finding(rel,'source-binding')
        after = path.lstat()
        if file_identity(before)!=file_identity(after) or path.resolve()!=path:
            scanner.finding(rel, 'source-binding')
    scanner.stream(io.BytesIO(graph_bytes), len(graph_bytes), 'graph.json')
    scanner.stream(io.BytesIO(descriptor), len(descriptor), 'desktop-runtime.json')
    return scanner.result(graphSha256=graph_sha256, descriptorSha256=descriptor_sha256)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=['graph', 'zip'])
    parser.add_argument('input')
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--descriptor-sha256')
    parser.add_argument('--allowlist')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if not output.is_absolute() or os.name == 'nt' and output.drive.upper() != 'D:':
        parser.error('Output must be an absolute D: evidence path')
    allowlist_bytes = Path(args.allowlist).read_bytes() if args.allowlist else None
    options = {'allowlist': json.loads(allowlist_bytes)} if allowlist_bytes else {}
    result = audit_graph(args.input, args.sha256, args.descriptor_sha256, **options) if args.kind == 'graph' else audit_zip(args.input, args.sha256, **options)
    result['exceptionPolicySha256'] = hashlib.sha256(allowlist_bytes).hexdigest() if allowlist_bytes else None
    with output.open('x', encoding='utf-8') as f:
        json.dump(result, f, indent=2); f.write('\n')
    print(json.dumps({'status': result['status'], 'files': len(result['files']), 'unresolvedFindings': result['unresolvedFindings'], 'gaps': len(result['gaps'])}))
    return 0 if result['status'] == 'pass' else 1

if __name__ == '__main__':
    raise SystemExit(main())
