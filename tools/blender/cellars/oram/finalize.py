"""Refresh actual-import captures, then prove repeatable authored GLB output."""
from pathlib import Path
import runpy
HERE=Path(__file__).resolve().parent
runpy.run_path(str(HERE/'review.py'),run_name='__main__')
runpy.run_path(str(HERE/'repeat.py'),run_name='__main__')
