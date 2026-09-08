"""Full reproducible final artifact pass through one isolated Blender MCP request."""
import runpy
from pathlib import Path
here=Path(__file__).resolve().parent
runpy.run_path(str(here/'build.py'),run_name='__main__')
runpy.run_path(str(here/'render.py'),run_name='__main__')
