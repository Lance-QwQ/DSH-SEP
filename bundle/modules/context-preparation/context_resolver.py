"""Read-only static named-inheritance context selection from an authorized snapshot.

Never imports or executes supplied Python. No filesystem or network source discovery.
Pass denotes the requested static base edges only, not executable dependency closure.
"""
import ast
import hashlib
import json
import re
import sys


def path_ok(path):
    if not isinstance(path, str) or len(path) > 512 or not path.endswith('.py'):
        raise ValueError('CONTEXT_PATH')
    if any(c in path for c in '\\:\x00') or any(p in ('', '.', '..', '.git') for p in path.split('/')):
        raise ValueError('CONTEXT_PATH')
    return path


def resolve(files, seeds, roots, *, max_bytes=2 * 1024 * 1024, max_files=128):
    if not isinstance(files, dict) or not 1 <= len(files) <= 4096:
        raise ValueError('CONTEXT_CATALOG')
    if not isinstance(seeds, list) or not 1 <= len(seeds) <= 128 or not isinstance(roots, list) or not 1 <= len(roots) <= 32:
        raise ValueError('CONTEXT_REQUEST')
    if type(max_bytes) is not int or not 1 <= max_bytes <= 2 * 1024 * 1024 or type(max_files) is not int or not 1 <= max_files <= 128:
        raise ValueError('CONTEXT_LIMIT')
    modules = {}
    total = 0
    for p, source in files.items():
        path_ok(p)
        if not isinstance(source, str):
            raise ValueError('CONTEXT_SOURCE')
        total += len(source.encode('utf-8'))
        name = p[:-3].replace('/', '.')
        if name.endswith('.__init__'):
            name = name[:-9]
        if name in modules:
            raise ValueError('CONTEXT_AMBIGUOUS_MODULE')
        modules[name] = p
    if total > 8 * 1024 * 1024 or len({p.casefold() for p in files}) != len(files):
        raise ValueError('CONTEXT_CATALOG_LIMIT')
    selected, tables, graph, unresolved, warnings = {}, {}, {}, [], []
    resolving, visiting = set(), set()

    def add(p):
        if p not in files:
            raise ValueError('CONTEXT_SOURCE_MISSING')
        if p not in selected:
            if len(selected) >= max_files or sum(len(s.encode('utf-8')) for s in selected.values()) + len(files[p].encode('utf-8')) > max_bytes:
                raise ValueError('CONTEXT_LIMIT')
            selected[p] = files[p]

    def issue(p, symbol, reason):
        row = {'path': p, 'symbol': symbol, 'reason': reason}
        if row not in unresolved:
            unresolved.append(row)

    def table(p):
        add(p)
        if p in tables:
            return tables[p]
        try:
            tree = ast.parse(files[p])
        except (SyntaxError, ValueError, RecursionError) as e:
            raise ValueError('CONTEXT_SYNTAX') from e
        bindings = {}
        package = p[:-12] if p.endswith('/__init__.py') else p.rpartition('/')[0]
        def bind(n, value):
            bindings.setdefault(n, []).append(value)
        def scan(nodes, conditional=False):
            for n in nodes:
                if isinstance(n, ast.ClassDef):
                    bind(n.name, ('unknown',) if conditional else ('class', n))
                elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    bind(n.name, ('unknown',))
                elif isinstance(n, ast.ImportFrom):
                    parts = package.split('/') if package else []
                    if n.level:
                        module = '.'.join(parts[:len(parts) - n.level + 1]) if n.level <= len(parts) else '!outside'
                        if n.module:
                            module += '.' + n.module
                    else:
                        module = n.module or ''
                    for a in n.names:
                        bind(a.asname or a.name, ('unknown',) if conditional else ('from', module, a.name))
                elif isinstance(n, ast.Import):
                    for a in n.names:
                        bind(a.asname or a.name.split('.')[0], ('unknown',) if conditional else ('module', a.name if a.asname else a.name.split('.')[0]))
                elif isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                    targets = n.targets if isinstance(n, ast.Assign) else [n.target]
                    for target in targets:
                        for name in ast.walk(target):
                            if isinstance(name, ast.Name):
                                bind(name.id, ('unknown',))
                else:
                    # Runtime-controlled bindings never count as resolved imports.
                    for field in ('body', 'orelse', 'finalbody'):
                        body = getattr(n, field, None)
                        if isinstance(body, list):
                            scan(body, True)
                    for handler in getattr(n, 'handlers', []):
                        scan(handler.body, True)
        scan(tree.body)
        tables[p] = bindings
        return bindings

    def follow_module(module, symbol, origin):
        p = modules.get(module)
        if p is None:
            issue(origin, module + '.' + symbol, 'module_not_in_authorized_snapshot')
            return
        lookup(p, symbol)

    def lookup(p, symbol):
        key = (p, symbol)
        if key in resolving:
            issue(p, symbol, 'alias_cycle')
            return
        if len(resolving) >= 64:
            issue(p, symbol, 'depth_limit')
            return
        resolving.add(key)
        try:
            bindings = table(p)
            if '*' in bindings:
                issue(p, symbol, 'wildcard_binding_not_resolved')
                return
            head, _, tail = symbol.partition('.')
            options = bindings.get(head, [])
            if not options and head == 'object' and not tail:
                return
            if len(options) != 1:
                issue(p, symbol, 'missing_or_ambiguous_binding')
                return
            b = options[0]
            if b[0] == 'class' and not tail:
                visit(p, b[1])
            elif b[0] == 'from':
                follow_module(b[1], b[2] + ('.' + tail if tail else ''), p)
            elif b[0] == 'module' and tail:
                module, _, attr = (b[1] + '.' + tail).rpartition('.')
                follow_module(module, attr, p)
            else:
                issue(p, symbol, 'dynamic_or_unsupported_binding')
        finally:
            resolving.remove(key)

    def visit(p, node):
        key = p + ':' + node.name
        if key in visiting:
            issue(p, node.name, 'inheritance_cycle')
            return
        if key in graph:
            return
        visiting.add(key)
        graph[key] = {'path': p, 'symbol': node.name, 'bases': [ast.unparse(b) for b in node.bases]}
        if node.keywords or node.decorator_list:
            warnings.append({'path': p, 'symbol': node.name, 'reason': 'metaclass_keywords_and_decorators_out_of_scope'})
        for base in node.bases:
            name = ast.unparse(base)
            if re.fullmatch(r'[A-Za-z_]\w*(\.[A-Za-z_]\w*)*', name):
                lookup(p, name)
            else:
                issue(p, name, 'dynamic_base_expression')
        visiting.remove(key)

    for p in seeds:
        add(path_ok(p))
    for root in roots:
        if not isinstance(root, dict) or set(root) != {'path', 'symbol'} or not isinstance(root['symbol'], str) or not re.fullmatch(r'[A-Za-z_]\w*', root['symbol']):
            raise ValueError('CONTEXT_ROOT')
        lookup(path_ok(root['path']), root['symbol'])
    manifest = {p: hashlib.sha256(s.encode()).hexdigest() for p, s in sorted(selected.items())}
    return {'status': 'blocked' if unresolved else 'pass', 'scope': 'static_named_inheritance_only',
            'files': selected, 'sourceHashes': manifest, 'classes': graph, 'unresolved': unresolved,
            'warnings': warnings, 'bytes': sum(len(s.encode()) for s in selected.values()),
            'added': sorted(set(selected) - set(seeds))}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
        if len(raw) > 10 * 1024 * 1024:
            raise ValueError('CONTEXT_INPUT_LIMIT')
        data = json.loads(raw)
        result = resolve(data['files'], data['seeds'], data['roots'])
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
    except Exception as error:
        # Do not reflect untrusted source text in diagnostics.
        code = str(error) if isinstance(error, ValueError) and str(error).startswith('CONTEXT_') else 'CONTEXT_INVALID_INPUT'
        sys.stderr.write(code)
        sys.exit(1)
