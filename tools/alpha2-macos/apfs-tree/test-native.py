"""Native descriptor tests. Linux builds exercise POSIX only, never APFS."""
import fcntl, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, unittest

BINARY = pathlib.Path(sys.argv.pop(1)).resolve()
ROOT = pathlib.Path(sys.argv.pop(1)).resolve()
ROOT.mkdir(mode=0o700, parents=True, exist_ok=False)

class NativeTree(unittest.TestCase):
    def setUp(self):
        self.home = pathlib.Path(tempfile.mkdtemp(dir=ROOT))
        self.source = self.home / 'source'; self.source.mkdir(mode=0o700)
        (self.source / 'note.txt').write_bytes(b'original')
    def run_tree(self, source=None, destination=None, change=None):
        args = [str(BINARY), 'tree', str(source or self.source)]
        if destination is not None: args.append(str(destination))
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        rows = []
        try:
            while True:
                line = process.stdout.readline()
                if not line: break
                row = json.loads(line); rows.append(row)
                if row.get('phase') == 'prepared':
                    if change: change()
                    process.stdin.write('verify\n'); process.stdin.flush()
            _, errors = process.communicate(timeout=10)
            return process.returncode, rows, errors
        finally:
            if process.poll() is None: process.kill(); process.wait(timeout=5)
    def rejection(self, expected, **kwargs):
        code, rows, error = self.run_tree(**kwargs)
        self.assertNotEqual(code, 0); self.assertIn(expected, error)
        self.assertFalse(any(row.get('phase') == 'committed' for row in rows))
    def test_01_actual_content_and_stable_order(self):
        (self.source / '中文').mkdir(); (self.source / '中文' / 'a').write_bytes(b'hello')
        code, rows, err = self.run_tree(); self.assertEqual(code, 0, err)
        files = {bytes.fromhex(r['pathHex']).decode(): bytes.fromhex(r['dataHex']) for r in rows if r.get('kind') == 'file'}
        self.assertEqual(files, {'note.txt': b'original', '中文/a': b'hello'})
        self.assertEqual(rows[-1]['phase'], 'committed')
    def test_02_copy_private_and_preserve_executable(self):
        os.chmod(self.source / 'note.txt', 0o700)
        dest = self.home / 'copy'; dest.mkdir(mode=0o700)
        code, _, err = self.run_tree(destination=dest); self.assertEqual(code, 0, err)
        self.assertEqual((dest / 'note.txt').read_bytes(), b'original')
        self.assertEqual((dest / 'note.txt').stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.source / 'note.txt').read_bytes(), b'original')
    def test_03_symlink_file_denied(self):
        (self.source / 'escape').symlink_to('/etc/passwd'); self.rejection('SEP_PROJECT_UNSAFE_TREE')
    def test_04_hard_link_denied(self):
        os.link(self.source / 'note.txt', self.home / 'alias'); self.rejection('SEP_PROJECT_UNSAFE_TREE')
    def test_05_symlink_parent_denied(self):
        alias = self.home / 'alias'; alias.symlink_to(self.source, target_is_directory=True)
        self.rejection('SEP_PROJECT_PATH', source=alias)
    def test_06_existing_destination_denied(self):
        dest = self.home / 'copy'; dest.mkdir(mode=0o700); (dest / 'keep').write_text('keep')
        self.rejection('SEP_PROJECT_UNSAFE_TREE', destination=dest)
        self.assertEqual((dest / 'keep').read_text(), 'keep')
    def test_07_file_limit(self):
        with (self.source / 'large').open('wb') as file: file.truncate(4194305)
        self.rejection('SEP_PROJECT_LIMIT')
    def test_08_special_fifo_denied(self):
        os.mkfifo(self.source / 'fifo'); self.rejection('SEP_PROJECT_UNSAFE_TREE')
    def test_09_change_after_capture_rejected(self):
        self.rejection('SEP_PROJECT_TREE_CHANGED', change=lambda: (self.source / 'note.txt').write_bytes(b'rewritten'))
    def test_10_root_swap_after_capture_rejected(self):
        def change():
            self.source.rename(self.home / 'old'); self.source.mkdir(mode=0o700)
            (self.source / 'note.txt').write_bytes(b'original')
        self.rejection('SEP_PROJECT_TREE_CHANGED', change=change)
    def test_11_destination_swap_after_copy_rejected(self):
        dest = self.home / 'copy'; dest.mkdir(mode=0o700)
        def change():
            dest.rename(self.home / 'old-copy'); dest.mkdir(mode=0o700)
        self.rejection('SEP_PROJECT_TREE_CHANGED', destination=dest, change=change)
    def test_12_entry_limit(self):
        for i in range(1024): (self.source / str(i)).touch()
        self.rejection('SEP_PROJECT_LIMIT')
    def test_13_depth_limit(self):
        parent = self.source
        for i in range(17): parent = parent / str(i); parent.mkdir()
        self.rejection('SEP_PROJECT_LIMIT')
    def test_14_directory_handle_observes_swap(self):
        process = subprocess.Popen([str(BINARY), 'hold', str(self.source), 'private'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            first = process.stdout.readline(); self.assertTrue(first, 'missing directory receipt')
            self.assertEqual(json.loads(first)['kind'], 'directory')
            self.source.rename(self.home / 'old'); self.source.mkdir(mode=0o700)
            _, err = process.communicate('stat\n', timeout=5)
            self.assertNotEqual(process.returncode, 0); self.assertIn('SEP_PROJECT_TREE_CHANGED', err)
        finally:
            if process.poll() is None: process.kill(); process.wait(timeout=5)
    def apply(self, path, expected, text=b'', delete=False):
        return subprocess.run([str(BINARY), 'apply', str(self.source), path, expected, 'delete' if delete else 'write'], input=text.hex()+'\n', capture_output=True, text=True, timeout=10)
    def file_version(self):
        code, rows, error = self.run_tree(); self.assertEqual(code, 0, error)
        return next(r['version'] for r in rows if r.get('kind') == 'file')
    def test_15_create_if_absent(self):
        result=self.apply('new.txt','absent',b'created'); self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.source/'new.txt').read_bytes(),b'created')
    def test_16_replace_observed_file(self):
        result=self.apply('note.txt',self.file_version(),b'new');self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.source/'note.txt').read_bytes(),b'new')
        self.assertEqual((self.source/'note.txt').stat().st_nlink,1)
    def test_17_stale_write_does_not_replace(self):
        old=self.file_version();(self.source/'note.txt').write_bytes(b'concurrent')
        result=self.apply('note.txt',old,b'new');self.assertNotEqual(result.returncode,0)
        self.assertIn('SEP_PROJECT_STALE_FILE',result.stderr);self.assertEqual((self.source/'note.txt').read_bytes(),b'concurrent')
    def test_18_absent_does_not_overwrite(self):
        result=self.apply('note.txt','absent',b'new');self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.source/'note.txt').read_bytes(),b'original')
    def test_19_delete_observed(self):
        result=self.apply('note.txt',self.file_version(),delete=True);self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse((self.source/'note.txt').exists())
    def test_20_apply_parent_symlink_rejected(self):
        outside=self.home/'outside';outside.mkdir();(self.source/'escape').symlink_to(outside)
        result=self.apply('escape/new','absent',b'new');self.assertNotEqual(result.returncode,0)
        self.assertFalse((outside/'new').exists())
    def test_21_apply_dot_segment_rejected(self):
        result=self.apply('../escape','absent',b'new');self.assertNotEqual(result.returncode,0)
        self.assertFalse((self.home/'escape').exists())
    def test_22_apply_hard_link_rejected(self):
        old=self.file_version();os.link(self.source/'note.txt',self.home/'alias')
        result=self.apply('note.txt',old,b'new');self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.home/'alias').read_bytes(),b'original')
    def test_23_apply_symlink_target_rejected(self):
        outside=self.home/'outside';outside.write_bytes(b'outside');(self.source/'alias').symlink_to(outside)
        result=self.apply('alias','absent',b'new');self.assertNotEqual(result.returncode,0)
        self.assertEqual(outside.read_bytes(),b'outside')
    def test_24_controller_lock_busy_is_not_waited_out(self):
        lock=self.home/'.native.lock';lock.touch(mode=0o600)
        with lock.open('r+') as held:
            fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
            result=subprocess.run([str(BINARY),'sync',str(self.source)],env={**os.environ,'SEP_PROJECT_NATIVE_LOCK':str(lock)},capture_output=True,text=True,timeout=3)
            self.assertNotEqual(result.returncode,0);self.assertIn('SEP_PROJECT_BUSY',result.stderr)
        result=subprocess.run([str(BINARY),'sync',str(self.source)],env={**os.environ,'SEP_PROJECT_NATIVE_LOCK':str(lock)},capture_output=True,text=True,timeout=3)
        self.assertEqual(result.returncode,0,result.stderr)
    def test_25_controller_lock_alias_rejected(self):
        outside=self.home/'outside';outside.write_bytes(b'keep');lock=self.home/'.native.lock';lock.symlink_to(outside)
        result=subprocess.run([str(BINARY),'sync',str(self.source)],env={**os.environ,'SEP_PROJECT_NATIVE_LOCK':str(lock)},capture_output=True,text=True,timeout=3)
        self.assertNotEqual(result.returncode,0);self.assertIn('SEP_PROJECT_NATIVE_LOCK',result.stderr)
        self.assertEqual(outside.read_bytes(),b'keep')
    def test_26_payload_size_bound(self):
        result=self.apply('too-large','absent',b'x'*4194305);self.assertNotEqual(result.returncode,0)
        self.assertFalse((self.source/'too-large').exists())
    def test_27_copy_root_cannot_be_source_descendant(self):
        dest=self.source/'nested';dest.mkdir(mode=0o700)
        self.rejection('SEP_PROJECT_PATH',destination=dest)
    def test_28_source_addition_after_capture_rejected(self):
        self.rejection('SEP_PROJECT_TREE_CHANGED',change=lambda:(self.source/'late').write_text('late'))
    def test_29_copy_cannot_follow_preexisting_destination_symlink(self):
        dest=self.home/'alias';dest.symlink_to(self.home,target_is_directory=True)
        self.rejection('SEP_PROJECT_PATH',destination=dest)
    def test_30_abandoned_prepared_helper_releases_controller_lock(self):
        lock=self.home/'.native.lock';env={**os.environ,'SEP_PROJECT_NATIVE_LOCK':str(lock)}
        process=subprocess.Popen([str(BINARY),'tree',str(self.source)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
        try:
            while True:
                line=process.stdout.readline();self.assertTrue(line)
                if json.loads(line).get('phase')=='prepared':break
            busy=subprocess.run([str(BINARY),'sync',str(self.source)],env=env,capture_output=True,text=True,timeout=3)
            self.assertNotEqual(busy.returncode,0);self.assertIn('SEP_PROJECT_BUSY',busy.stderr)
            _,error=process.communicate(timeout=3);self.assertNotEqual(process.returncode,0);self.assertIn('SEP_PROJECT_PROTOCOL',error)
            recovered=subprocess.run([str(BINARY),'sync',str(self.source)],env=env,capture_output=True,text=True,timeout=3)
            self.assertEqual(recovered.returncode,0,recovered.stderr)
        finally:
            if process.poll() is None:process.kill();process.wait(timeout=3)

if __name__ == '__main__': unittest.main()
