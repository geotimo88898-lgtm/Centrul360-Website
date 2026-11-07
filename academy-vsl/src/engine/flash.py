#!/usr/bin/env python3
"""Flash check (photosensitive safety): no more than 3 big brightness jumps in any second. python3 flash.py <video>"""
import subprocess, sys
import numpy as np
f = sys.argv[1]
w, h = 64, 36
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
y = np.frombuffer(raw, np.uint8).reshape(-1, h * w).astype(np.float32)
fps = 30
lum = y.mean(1)
d = np.abs(np.diff(lum))
big = d > 0.1 * 255  # a jump of 10% of full brightness between two frames
worst = 0
for i in range(0, max(1, len(big) - fps)):
    worst = max(worst, int(big[i:i + fps].sum()))
area = (np.abs(np.diff(y, axis=0)) > 0.2 * 255).mean(1)  # the share of the frame that changes hard
print(f'flash check: {len(lum)} frames, {int(big.sum())} big jumps, worst second {worst}, max changing area {area.max()*100:.0f}% -> ' + ('OK' if worst <= 3 else 'TOO MANY FLASHES'))
sys.exit(0 if worst <= 3 else 3)
