"""Trusted sandbox bootstrap: independently copy a bounded read-only snapshot.
The caller's SHA binds the exact input tree before any task code is executed.
"""
import os, sys, stat, hashlib, json

expected = sys.argv[1]
entries = []
total = 0

def digest(data):
    return hashlib.sha256(data).hexdigest()

def version(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_mode, s.st_nlink)

def walk(source, destination, prefix='', depth=0):
    global total
    if depth > 16:
        raise RuntimeError('SEP_PROJECT_LIMIT')
    before = os.stat(source, follow_symlinks=False)
    for name in sorted(os.listdir(source), key=lambda s: s.encode('utf-8')):
        if len(entries) >= 1024 or len(name) > 200 or any(ord(c) < 32 or ord(c) == 127 for c in name):
            raise RuntimeError('SEP_PROJECT_LIMIT')
        origin, target = source + '/' + name, destination + '/' + name
        path = prefix + '/' + name if prefix else name
        s = os.stat(origin, follow_symlinks=False)
        if stat.S_ISDIR(s.st_mode):
            os.mkdir(target, 0o700)
            entries.append(dict(path=path, kind='directory'))
            walk(origin, target, path, depth + 1)
        elif stat.S_ISREG(s.st_mode) and s.st_nlink == 1:
            if s.st_size > 4194304 or total + s.st_size > 33554432:
                raise RuntimeError('SEP_PROJECT_LIMIT')
            fd = os.open(origin, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as f:
                if version(s) != version(os.fstat(f.fileno())):
                    raise RuntimeError('SEP_PROJECT_TREE_CHANGED')
                body = f.read(s.st_size + 1)
                if len(body) != s.st_size or version(s) != version(os.fstat(f.fileno())) or version(s) != version(os.stat(origin, follow_symlinks=False)):
                    raise RuntimeError('SEP_PROJECT_TREE_CHANGED')
            total += len(body)
            executable = bool(s.st_mode & stat.S_IXUSR)
            out = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o700 if executable else 0o600)
            with os.fdopen(out, 'wb') as f:
                f.write(body)
            entries.append(dict(path=path, kind='file', size=len(body), sha256=digest(body), executable=executable))
        else:
            raise RuntimeError('SEP_PROJECT_UNSAFE_TREE')
    if version(before) != version(os.stat(source, follow_symlinks=False)):
        raise RuntimeError('SEP_PROJECT_TREE_CHANGED')

walk('/source', '/work')
entries.sort(key=lambda e: e['path'].encode('utf-8'))
if digest(json.dumps(entries, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) != expected:
    raise RuntimeError('SEP_PROJECT_TREE_CHANGED')
os.execv(sys.argv[2], sys.argv[2:])
