#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Готовит РАЗВОРОТЫ учебника для урока-листалки: картинки страниц + координаты фраз.

Зачем: новая форма урока (после созвона 02.08) — настоящий учебник в центре экрана,
который ИИ-учитель листает сам, подчёркивает и выделяет в нём то, о чём говорит.
Чтобы подчёркивать ПО-НАСТОЯЩЕМУ, а не рисовать полоски на глаз, берём текстовый слой
PDF: `page.search_for(фраза)` отдаёт прямоугольники слов, мы переводим их в доли
страницы (0..1) — верстка урока не зависит от размера картинки.

    python scripts/make-book-pages.py                 # §20, страницы книги 120–125
    python scripts/make-book-pages.py 120-125 --dpi 150

Выход (всё в .tmp — учебник под копирайтом, в репозиторий не кладём):
    .tmp/sketches/tutor/book/p120.jpg …               картинки страниц
    .tmp/sketches/tutor/book/pages.json               размеры + текст каждой страницы
Фразы для подсветки ищет отдельная команда:
    python scripts/make-book-pages.py --marks marks-src.json
"""
import argparse, io, json, os, sys
from pathlib import Path

# консоль Windows по умолчанию cp1251 и давится стрелками — переводим вывод в UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import fitz  # PyMuPDF

PDF = Path(os.environ.get('KLASSIO_TEXTBOOK_PDF', Path.home() / 'Downloads' / '5_klass_Istoria_Drevnego_mira.pdf'))
OUT = Path('.tmp/sketches/tutor/book')
# ⚠️ Страница PDF = страница книги − 2 (оглавление врёт на +2, проверено 28.07)
SHIFT = 2


def render(pages, dpi):
    OUT.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    meta = {}
    for bp in pages:
        pg = doc[bp - SHIFT - 1]                       # 0-based индекс страницы PDF
        pix = pg.get_pixmap(dpi=dpi)
        (OUT / f'p{bp}.jpg').write_bytes(pix.tobytes('jpg', jpg_quality=84))
        r = pg.rect
        meta[str(bp)] = {'w': r.width, 'h': r.height, 'px': [pix.width, pix.height],
                         'text': pg.get_text()}
        print(f'  стр. книги {bp} (PDF {bp - SHIFT}) → p{bp}.jpg  {pix.width}×{pix.height}')
    (OUT / 'pages.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    return meta


def marks(src):
    """src = [{"id":"...", "page":120, "text":"искомая фраза"}, ...]
    → marks.json: {"id": {"page":120, "rects":[[x,y,w,h] в долях страницы]}}"""
    doc = fitz.open(PDF)
    items = json.loads(Path(src).read_text(encoding='utf-8'))
    out, miss = {}, []
    for it in items:
        pg = doc[it['page'] - SHIFT - 1]
        R = pg.rect
        found = []
        # у картинок текста нет — их рамка задаётся руками, в долях страницы
        if it.get('rect'):
            out[it['id']] = {'page': it['page'], 'rects': [it['rect']], 'kind': 'image'}
            continue
        # фразу ищем целиком; не нашлась (перенос строки, дефис) — по кускам
        chunks = [it['text']] if pg.search_for(it['text']) else [c for c in it['text'].split('|') if c.strip()]
        for c in chunks:
            for r in pg.search_for(c.strip()):
                found.append([round(r.x0 / R.width, 5), round(r.y0 / R.height, 5),
                              round((r.x1 - r.x0) / R.width, 5), round((r.y1 - r.y0) / R.height, 5)])
        if not found:
            miss.append(it['id'])
            continue
        out[it['id']] = {'page': it['page'], 'rects': found}
    (OUT / 'marks.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  меток: {len(out)}' + (f' · НЕ НАЙДЕНЫ: {", ".join(miss)}' if miss else ''))
    return out


def blocks(pages):
    """Абзацы учебника со СТРОКАМИ и их координатами — чтобы учитель читала параграф
    слово в слово и вела подсветкой по той самой строке, которую произносит.

    Отдаём: [{page, i, text, lines:[{t, r:[x,y,w,h]}], box:[x,y,w,h]}] в порядке чтения
    (сверху вниз, слева направо). Служебное — колонтитул, номер страницы, «ГЛАВА III» —
    помечаем skip:true, но не выбрасываем: пусть решает страница урока.
    """
    doc = fitz.open(PDF)
    out = []
    for bp in pages:
        pg = doc[bp - SHIFT - 1]
        R = pg.rect
        d = pg.get_text('dict')
        items = []
        for b in d['blocks']:
            if b.get('type') != 0:
                # картинка: текста нет, но рамка нужна — по ней учитель наводит
                # прожектор, когда читает подпись под этой картинкой
                x0, y0, x1, y1 = b['bbox']
                if (x1 - x0) / R.width > .12 and (y1 - y0) / R.height > .06:
                    items.append({'page': bp, 'image': True, 'text': '', 'lines': [],
                                  'box': [round(x0 / R.width, 5), round(y0 / R.height, 5),
                                          round((x1 - x0) / R.width, 5), round((y1 - y0) / R.height, 5)],
                                  'skip': True})
                continue
            lines = []
            for ln in b['lines']:
                t = ''.join(s['text'] for s in ln['spans']).strip()
                if not t:
                    continue
                x0, y0, x1, y1 = ln['bbox']
                lines.append({'t': t, 'r': [round(x0 / R.width, 5), round(y0 / R.height, 5),
                                            round((x1 - x0) / R.width, 5), round((y1 - y0) / R.height, 5)]})
            if not lines:
                continue
            x0, y0, x1, y1 = b['bbox']
            txt = ' '.join(l['t'] for l in lines)
            short = len(txt) < 45
            head = txt.strip().startswith(('ГЛАВА', '§ 20.')) or txt.strip() == str(bp)
            items.append({'page': bp, 'text': txt, 'lines': lines,
                          'box': [round(x0 / R.width, 5), round(y0 / R.height, 5),
                                  round((x1 - x0) / R.width, 5), round((y1 - y0) / R.height, 5)],
                          'skip': bool(head or (short and txt.strip().isdigit()))})
        # порядок чтения: сверху вниз; на одной высоте — слева направо
        items.sort(key=lambda it: (round(it['box'][1], 2), it['box'][0]))
        for i, it in enumerate(items):
            it['i'] = i
        out += items
    (OUT / 'blocks.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  абзацев: {len(out)} (строк {sum(len(b["lines"]) for b in out)})')
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('pages', nargs='*', default=['120-125'])
    ap.add_argument('--dpi', type=int, default=150)
    ap.add_argument('--marks')
    ap.add_argument('--blocks', action='store_true')
    a = ap.parse_args()
    nums = []
    for tok in (a.pages or ['120-125']):
        if '-' in tok:
            x, y = tok.split('-', 1); nums += list(range(int(x), int(y) + 1))
        else:
            nums.append(int(tok))
    if a.blocks:
        blocks(nums)
    elif a.marks:
        marks(a.marks)
    else:
        render(nums, a.dpi)
        print(f'✅ готово → {OUT}')
