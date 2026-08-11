#!/usr/bin/env python
"""Рендер отдельных страниц учебника в PNG — чтобы читать ТОЛЬКО нужный параграф,
а не тащить в контекст все 275 страниц скана.

Учебник: Мединский В.Р., Чубарьян А.О. «История Древнего мира. 5 класс», скан без
текстового слоя (275 стр.), поэтому grep невозможен — только чтение глазами.

Использование:
    python scripts/tb-page.py 143-148          # диапазон
    python scripts/tb-page.py 143 150 151      # отдельные страницы
    python scripts/tb-page.py 143-148 --dpi 200
    python scripts/tb-page.py --map            # показать карту параграфов, если она уже собрана

Путь к PDF берётся из переменной окружения KLASSIO_TEXTBOOK_PDF, иначе — дефолт ниже.
PNG кладутся в скретчпад сессии, в репозиторий не попадают (учебник под копирайтом).
"""
import argparse
import os
import sys
from pathlib import Path

import fitz  # PyMuPDF

DEFAULT_PDF = Path.home() / "Downloads" / "5_klass_Istoria_Drevnego_mira.pdf"
OUT_DIR = Path(
    os.environ.get(
        "KLASSIO_TB_OUT",
        r"C:\Users\krato\AppData\Local\Temp\claude\C--Users-krato-ClaudeVibecoding-ClaudeDesktop-Klassio"
        r"\5bf3f536-ba4e-4835-84de-2b885690d027\scratchpad\tb",
    )
)
MAP_FILE = Path(__file__).resolve().parent.parent / ".planning" / "TEXTBOOK-PAGE-MAP.md"


def parse_pages(tokens):
    """'143-148' и '150' -> [143..148, 150] (номера страниц PDF, 1-based)."""
    pages = []
    for tok in tokens:
        if "-" in tok:
            a, b = tok.split("-", 1)
            pages.extend(range(int(a), int(b) + 1))
        else:
            pages.append(int(tok))
    return pages


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pages", nargs="*", help="страницы PDF: 143-148 или 143 150")
    ap.add_argument("--dpi", type=int, default=150, help="разрешение рендера (по умолчанию 150)")
    ap.add_argument("--pdf", default=os.environ.get("KLASSIO_TEXTBOOK_PDF", str(DEFAULT_PDF)))
    ap.add_argument("--map", action="store_true", help="показать карту параграфов")
    args = ap.parse_args()

    if args.map:
        if MAP_FILE.exists():
            print(MAP_FILE.read_text(encoding="utf-8"))
        else:
            print(f"Карта ещё не собрана: {MAP_FILE} не существует")
        return 0

    if not args.pages:
        ap.error("укажи страницы, например: 143-148")

    pdf = Path(args.pdf)
    if not pdf.exists():
        print(f"НЕ НАЙДЕН PDF: {pdf}", file=sys.stderr)
        return 1

    doc = fitz.open(pdf)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    zoom = args.dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)

    written = []
    for pno in parse_pages(args.pages):
        if not 1 <= pno <= doc.page_count:
            print(f"пропуск {pno}: вне диапазона 1..{doc.page_count}", file=sys.stderr)
            continue
        out = OUT_DIR / f"p{pno:03d}.png"
        doc[pno - 1].get_pixmap(matrix=mat).save(out)
        written.append(out)
        print(out)

    print(f"\nготово: {len(written)} стр. при {args.dpi} dpi -> {OUT_DIR}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
