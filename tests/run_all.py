"""
Runs all Python tests in the tests/ directory.
Usage: python3 tests/run_all.py
Exit code 0 = all pass, 1 = any failure.
"""

import sys
import unittest
from pathlib import Path

# Ensure tests/ is on the path so test files can import each other if needed
sys.path.insert(0, str(Path(__file__).parent))

loader = unittest.TestLoader()
suite = loader.discover(start_dir=str(Path(__file__).parent), pattern='test_*.py')

runner = unittest.TextTestRunner(verbosity=2)
result = runner.run(suite)

sys.exit(0 if result.wasSuccessful() else 1)
