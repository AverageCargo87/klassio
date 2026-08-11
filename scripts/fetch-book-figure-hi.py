#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Забирает АПСКЕЙЛ иллюстрации учебника и кладёт его рядом со страницей.

Апскейл делает Higgsfield (bytedance_image_upscale, 4K, 2 кредита за картинку) —
запускается из чата через MCP, здесь только приёмка результата: скачать, ужать до
разумного для браузера размера и записать в figures.json, что у этой иллюстрации
появился файл `hi`.

Зачем ужимать: апскейлер отдаёт PNG 4096 px (8–15 МБ). Ребёнку столько не нужно —
картинку смотрят во весь экран, 2560 px хватает с запасом, а вес падает в 20 раз.
4K-оригинал остаётся рядом (`_hi-src-*.png`) — если понадобится печать.

    python scripts/fetch-book-figure-hi.py p120-1 https://…/hf_….png
"""
import io, json, sys, urllib.request
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from PIL import Image

OUT = Path('.tmp/sketches/tutor/book')
MAXPX = 2560                    # длинная сторона для браузера
QUALITY = 88


def fetch(fid, url):
    fj = OUT / 'figures.json'
    figs = json.loads(fj.read_text(encoding='utf-8'))
    it = next((f for f in figs if f['id'] == fid), None)
    if not it:
        sys.exit(f'нет иллюстрации {fid} в figures.json — сначала make-book-figures.py')

    req = urllib.request.Request(url, headers={'User-Agent': 'klassio/1.0'})
    raw = urllib.request.urlopen(req, timeout=180).read()
    (OUT / f'_hi-src-{fid}.png').write_bytes(raw)

    im = Image.open(io.BytesIO(raw)).convert('RGB')
    w0, h0 = im.size
    if max(im.size) > MAXPX:
        k = MAXPX / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    dst = OUT / f'hi-{fid}.jpg'
    im.save(dst, 'JPEG', quality=QUALITY, optimize=True, progressive=True)

    it['hi'] = dst.name
    it['hiW'], it['hiH'] = im.size
    fj.write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  {fid}: было {it["w"]}×{it["h"]} → апскейл {w0}×{h0} → в урок {im.width}×{im.height}'
          f'  {dst.stat().st_size // 1024} КБ')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    fetch(sys.argv[1], sys.argv[2])
