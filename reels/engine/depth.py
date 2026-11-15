#!/usr/bin/env python3
"""Depth maps of real photos, for the 2.5D camera (a photo cut into depth: parallax, dolly zoom).
  python3 depth.py <out dir> <photo> [photo …]
→ <out dir>/<photo name>.png: 16-bit grey, white = near, black = far, the photo's own aspect, long side 768 px.
Depth Anything V2 (small, Apache 2.0) on onnxruntime, on the CPU; the model (~99 MB) is downloaded once into
engine/img/ (ignored by git). The photos themselves are never changed: the depth only tells the camera how far each
pixel is."""
import os, sys, urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, 'img', 'depth-anything-v2-small.onnx')
URL = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx'


def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    if not os.path.exists(MODEL):
        os.makedirs(os.path.dirname(MODEL), exist_ok=True); print('downloading the depth model…'); urllib.request.urlretrieve(URL, MODEL)
    import onnxruntime as ort
    s = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider']); name = s.get_inputs()[0].name
    for p in sys.argv[2:]:
        im = Image.open(p).convert('RGB'); w, h = im.size
        k = 518 / max(w, h); iw, ih = max(14, round(w * k / 14) * 14), max(14, round(h * k / 14) * 14)
        x = np.asarray(im.resize((iw, ih), Image.BICUBIC), np.float32) / 255
        x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        d = s.run(None, {name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        d = (d - d.min()) / (np.ptp(d) + 1e-6)
        k2 = 768 / max(w, h); ow, oh = round(w * k2), round(h * k2)
        D = Image.fromarray((d * 65535).astype(np.uint16)).resize((ow, oh), Image.BICUBIC)
        dst = os.path.join(out, os.path.splitext(os.path.basename(p))[0] + '.png'); D.save(dst); print(dst, D.size)


if __name__ == '__main__':
    main()
