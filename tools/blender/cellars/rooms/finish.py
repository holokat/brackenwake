"""Refresh the furnace views from an unobstructed reverse camera position."""
import os
import runpy
from pathlib import Path
here=Path(__file__).resolve().parent
runpy.run_path(str(here/'build.py'),run_name='__main__')
os.environ['CELLAR_RENDER_LEVELS']='[4]'
try:runpy.run_path(str(here/'render.py'),run_name='__main__')
finally:os.environ.pop('CELLAR_RENDER_LEVELS',None)
