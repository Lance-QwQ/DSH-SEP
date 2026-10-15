"""Rerun direct ZIP cases, preserving the separately blocked junction fixture.

The unchanged full-suite junction setup was rejected by Windows with WinError
225. This runner does not rewrite or retry that command, or count it as pass.
"""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

spec = importlib.util.spec_from_file_location('safe_extract_test', Path(__file__).with_name('safe_extract_test.py'))
suite_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(suite_module)
blocked = 'test_directory_alias_parent_refused'
names = unittest.defaultTestLoader.getTestCaseNames(suite_module.ArchiveTests)
assert len(names) == 31 and blocked in names
suite = unittest.TestSuite(suite_module.ArchiveTests(name) for name in names if name != blocked)
result = unittest.TextTestRunner(verbosity=2).run(suite)
print(json.dumps({'status': 'pass' if result.wasSuccessful() else 'fail', 'executed': result.testsRun,
                  'failures': len(result.failures), 'errors': len(result.errors),
                  'blocked': [{'test': blocked, 'reason': 'Unchanged junction fixture received Windows WinError 225; no bypass or substitute.'}]}))
sys.exit(0 if result.wasSuccessful() else 1)
