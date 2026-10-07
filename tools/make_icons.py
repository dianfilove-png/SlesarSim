#!/usr/bin/env python3
"""Рисует иконку приложения (штурвал задвижки на трубе) в mipmap-* каталоги."""
import os
import sys
import math
from PIL import Image, ImageDraw

RES = sys.argv[1] if len(sys.argv) > 1 else 'android/res'
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def icon(n):
    S = 512
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([16, 16, S - 16, S - 16], 110, fill=(20, 32, 48, 255))
    # трубы Т1/Т2
    d.rectangle([16, 330, S - 16, 380], fill=(224, 64, 47, 255))
    d.rectangle([16, 400, S - 16, 450], fill=(47, 127, 224, 255))
    # корпус задвижки
    d.rounded_rectangle([196, 300, 316, 410], 18, fill=(70, 76, 86, 255))
    d.rectangle([180, 296, 196, 414], fill=(55, 60, 68, 255))
    d.rectangle([316, 296, 332, 414], fill=(55, 60, 68, 255))
    d.rectangle([238, 170, 274, 300], fill=(150, 156, 164, 255))
    # штурвал
    cx, cy, r = 256, 160, 110
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(240, 160, 32, 255), width=34)
    for a in range(0, 360, 60):
        x = cx + math.cos(math.radians(a)) * (r - 10)
        y = cy + math.sin(math.radians(a)) * (r - 10)
        d.line([cx, cy, x, y], fill=(240, 160, 32, 255), width=22)
    d.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=(200, 120, 20, 255))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([16, 16, S - 16, S - 16], 110, fill=255)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out.resize((n, n), Image.LANCZOS)


for k, n in SIZES.items():
    p = os.path.join(RES, 'mipmap-' + k)
    os.makedirs(p, exist_ok=True)
    icon(n).save(os.path.join(p, 'ic_launcher.png'))
print('icons ok')
