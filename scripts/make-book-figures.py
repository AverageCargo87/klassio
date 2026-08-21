#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Вытаскивает ИЛЛЮСТРАЦИИ учебника из PDF — чтобы по ним можно было кликнуть в уроке.

Зачем: в развороте `/kniga` страница показана одной картинкой, и рисунок внутри неё
мелкий — рассмотреть нечего. Берём из PDF сам вшитый растр (не рендер страницы: рендер
только домалёвывает пиксели поверх тех же данных) и запоминаем, ГДЕ он лежит на странице
в долях 0..1 — по этой рамке урок кладёт прозрачную кликабельную зону.

Растры в учебнике крошечные (400×220 и меньше), поэтому дальше их поднимает апскейлер:
    node scripts/upscale-book-figures.mjs        # Higgsfield → hi-*.jpg

    python scripts/make-book-figures.py                  # §20, страницы книги 120–125
    python scripts/make-book-figures.py 120-121

Выход (всё в .tmp — учебник под копирайтом, в репозиторий не кладём):
    .tmp/sketches/tutor/book/fig-p120-1.jpg …   оригинал растра, как он лежит в PDF
    .tmp/sketches/tutor/book/figures.json        [{id, page, box, src, w, h, title, hi?}]
`hi` дописывает апскейлер; здесь он сохраняется, если файл уже был.
"""
import argparse, json, os, sys
from pathlib import Path

# консоль Windows по умолчанию cp1251 и давится стрелками — переводим вывод в UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import fitz  # PyMuPDF

PDF = Path(os.environ.get('KLASSIO_TEXTBOOK_PDF', Path.home() / 'Downloads' / '5_klass_Istoria_Drevnego_mira.pdf'))
OUT = Path('.tmp/sketches/tutor/book')
SHIFT = 2                       # страница PDF = страница книги − 2 (проверено 28.07)

MIN_W, MIN_H = .12, .06         # мельче — это иконки полей, не иллюстрации

# У части рисунков подписи в учебнике просто нет (текст рядом, во врезке). Название
# нужно только для шапки окна просмотра — дописываем руками, по смыслу врезки.
# 🔴 21.08. Автомат берёт подпись из ближайшего текстового блока снизу, и для трёх
# иллюстраций из пяти он её не нашёл: у них подпись стоит СБОКУ или выше картинки.
# Ребёнок открывал золотую маску Агамемнона и читал «Иллюстрация учебника».
# Тексты — дословные подписи самого учебника, не наши слова.
TITLES = {'p121-1': 'Природа Греции',
          'p122-1': 'Дворец в Кноссе. Реконструкция',
          'p124-1': 'Золотая маска царя Агамемнона',
          'p124-2': 'Львиные ворота в Микенах'}


def caption_for(pg, R, rect):
    """Подпись под картинкой: ПЕРВАЯ строка ближайшего текстового блока снизу.

    Именно строка, а не весь блок: в учебнике подпись и пояснение к ней лежат одним
    блоком, и по точке их не разделить («Кносский дворец. Реконструкция» — две части
    одного предложения). Строку, начинающуюся со строчной, отбрасываем: это не подпись,
    а перенос обычного абзаца.
    """
    best, bestdy = '', 1e9
    for b in pg.get_text('dict')['blocks']:
        if b.get('type') != 0:
            continue
        x0, y0, x1, y1 = b['bbox']
        dy = y0 - rect.y1
        if dy < -2 or dy > R.height * .05:                    # не сразу под картинкой
            continue
        ov = min(x1, rect.x1) - max(x0, rect.x0)              # перекрытие по горизонтали
        if ov < (rect.x1 - rect.x0) * .5:
            continue
        if dy < bestdy:
            ln = b['lines'][0]
            best, bestdy = ''.join(s['text'] for s in ln['spans']).strip(), dy
    if len(best) < 6 or not best[:1].isupper():
        return ''
    return best[:120]


def figures(pages):
    OUT.mkdir(parents=True, exist_ok=True)
    old = {}
    fj = OUT / 'figures.json'
    if fj.exists():
        old = {f['id']: f for f in json.loads(fj.read_text(encoding='utf-8'))}
    doc = fitz.open(PDF)
    out = []
    for bp in pages:
        pg = doc[bp - SHIFT - 1]
        R = pg.rect
        n = 0
        for im in pg.get_images(full=True):
            xref = im[0]
            rects = [r for r in pg.get_image_rects(xref)]
            for rect in rects:
                fw, fh = (rect.x1 - rect.x0) / R.width, (rect.y1 - rect.y0) / R.height
                # шапка страницы вылезает за лист (x0/y0 < 0) — это плашка, а не рисунок
                if fw < MIN_W or fh < MIN_H or rect.x0 < -1 or rect.y0 < -1:
                    continue
                info = doc.extract_image(xref)
                n += 1
                fid = f'p{bp}-{n}'
                src = f'fig-{fid}.{"jpg" if info["ext"] in ("jpeg", "jpg") else info["ext"]}'
                (OUT / src).write_bytes(info['image'])
                it = {'id': fid, 'page': bp,
                      'box': [round(rect.x0 / R.width, 5), round(rect.y0 / R.height, 5),
                              round(fw, 5), round(fh, 5)],
                      'src': src, 'w': info['width'], 'h': info['height'],
                      'title': TITLES.get(fid) or caption_for(pg, R, rect)}
                if old.get(fid, {}).get('hi'):
                    it['hi'] = old[fid]['hi']                 # апскейл уже сделан — не теряем
                out.append(it)
                print(f'  стр. {bp} · {fid}  {info["width"]}×{info["height"]} {info["ext"]}'
                      + (f'  «{it["title"]}»' if it['title'] else '')
                      + ('  ✅ hi' if it.get('hi') else ''))
    fj.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'✅ иллюстраций: {len(out)} → {fj}')
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('pages', nargs='*', default=['120-125'])
    a = ap.parse_args()
    nums = []
    for tok in (a.pages or ['120-125']):
        if '-' in tok:
            x, y = tok.split('-', 1); nums += list(range(int(x), int(y) + 1))
        else:
            nums.append(int(tok))
    figures(nums)
