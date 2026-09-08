"""Finish the 12-second Grok render as a silent, cyclic marketing background."""
import argparse
from pathlib import Path
import subprocess
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
source = root / 'outputs/background-video/ambient-source.mp4'
output = root / 'public/ui/brackenwake-ambient-loop.mp4'
temporary = output.with_suffix('.pending.mp4')
# Include the head's closing frame so it exactly matches the body's first frame.
# Fractional perspective coordinates avoid zoompan's integer crop jitter.
zoom = '0.0025*(1-cos(2*PI*on/632))'
seam = 'if(lte(T,20),0,if(gte(T,20.9),1,(1-cos(PI*(T-20)/0.9))/2))'
filters = (
 '[0:v:0]fps=24,trim=end_frame=288,setpts=PTS-STARTPTS,split[a][b];'
 '[a]trim=start_frame=36,setpts=PTS-STARTPTS,fps=24[body];'
 '[b]trim=end_frame=37,setpts=PTS-STARTPTS,fps=24[head];'
 '[body][head]xfade=transition=fade:duration=1.5:offset=9,'
 'setpts=2*PTS,fps=30,'
 f"perspective=x0='-W*({zoom})':y0='-H*({zoom})':"
 f"x1='W*(1+({zoom}))':y1='-H*({zoom})':"
 f"x2='-W*({zoom})':y2='H*(1+({zoom}))':"
 f"x3='W*(1+({zoom}))':y3='H*(1+({zoom}))':"
 'sense=destination:interpolation=cubic:eval=frame,format=yuv420p[out]'
)
result = subprocess.run([
 args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'warning', '-i', str(source),
 '-filter_complex', filters, '-map', '[out]', '-an', '-c:v', 'libx264',
 '-preset', 'slow', '-crf', '19', '-movflags', '+faststart',
 '-map_metadata', '-1', str(temporary),
], check=True)
finished = output.with_suffix('.finished.mp4')
subprocess.run([
 args.ffmpeg, '-y', '-v', 'error', '-i', str(temporary), '-i', str(temporary), '-filter_complex',
 f"[1:v]trim=end_frame=1,loop=loop=-1:size=1:start=0,setpts=N/(30*TB)[still];[0:v][still]blend=all_expr='A*(1-({seam}))+B*({seam})':shortest=1,format=yuv420p[out]",
 '-map', '[out]', '-an', '-t', '21', '-c:v', 'libx264', '-crf', '19',
 '-preset', 'slow', '-movflags', '+faststart', str(finished)
], check=True)
assert finished.stat().st_size > 1_000_000, 'Reject an unexpectedly short render'
finished.replace(output)
# The pending base is a rebuildable finishing intermediate, retained in /tmp.
shutil.move(str(temporary), '/tmp/brackenwake-loop-base.mp4')
print(output)
