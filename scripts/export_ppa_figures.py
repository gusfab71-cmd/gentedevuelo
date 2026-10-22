#!/usr/bin/env python3
"""Export original ANAC PPA figure crops to local static PNGs (no visual redrawing).

Sources: official ANAC PPA figures PDF, 24 pages. Figure 21 is intentionally
excluded: it is sourced from a different ANAC PDF and already exists locally.
"""
import io
import hashlib
import json
import pathlib
import urllib.request

import fitz
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "simulador-ppa" / "figuras"
URL = "https://www.argentina.gob.ar/sites/default/files/2021/05/anexo-figuras-para-las-preguntas-ppa.pdf"
EXPECTED_SHA256 = "43297779266d7ddcc6d6f9221cd068e906620986ee9dcfbf7a66f83d808bd08a"
FIGURES = {
    1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7], 5: [8],
    6: [9, 29], 7: [30, 31], 8: [33], 11: [34], 12: [35],
    13: [36], 14: [37], 15: [38, 39], 16: [41], 17: [48],
    18: [49], 19: [50], 20: [59, 61], 21: [62, 63],
    22: [65], 23: [66], 24: [67]
}

req = urllib.request.Request(URL, headers={"User-Agent": "GenteDeVuelo-PPA-educational/1.0"})
with urllib.request.urlopen(req, timeout=90) as response:
    pdf_bytes = response.read()
source_sha = hashlib.sha256(pdf_bytes).hexdigest()
if source_sha != EXPECTED_SHA256:
    raise RuntimeError("El PDF ANAC cambió. Revisar manualmente figuras antes de publicar. SHA: " + source_sha)
doc = fitz.open(stream=pdf_bytes, filetype="pdf")
if len(doc) != 24:
    raise RuntimeError("El anexo oficial no tiene las 24 páginas esperadas")
OUT.mkdir(parents=True, exist_ok=True)

def crop(page_no, top, bottom):
    page = doc[page_no - 1]
    box = fitz.Rect(55, max(125, top), 562, min(740, bottom))
    if box.height < 65:
        raise RuntimeError("Recorte anormal página " + str(page_no))
    pix = page.get_pixmap(matrix=fitz.Matrix(2.2, 2.2), clip=box, colorspace=fitz.csGRAY, alpha=False)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples)

def stack(parts):
    if len(parts) == 1:
        return parts[0]
    width = max(i.width for i in parts)
    height = sum(i.height for i in parts) + 16 * (len(parts)-1)
    result = Image.new("L", (width, height), 255)
    y = 0
    for i in parts:
        result.paste(i, (0, y))
        y += i.height + 16
    return result

sizes = {}
for page_no, numbers in FIGURES.items():
    page = doc[page_no - 1]
    positions = []
    for number in numbers:
        matches = page.search_for("Figura " + str(number) + ".")
        if not matches:
            raise RuntimeError("No se encuentra el título Figura %s página %s" % (number, page_no))
        positions.append(matches[0].y0)
    if positions != sorted(positions):
        raise RuntimeError("Figuras fuera de orden página " + str(page_no))
    for idx, number in enumerate(numbers):
        top = positions[idx] - 7
        bottom = positions[idx + 1] - 9 if idx + 1 < len(numbers) else 738
        parts = [crop(page_no, top, bottom)]
        if number == 33:  # tabla y sus continuaciones en páginas 9-10
            parts += [crop(9, 140, 738), crop(10, 140, 738)]
        if number == 39:  # notas de la tabla continúan en la página 16
            first = doc[15].search_for("Figura 41.")
            if not first: raise RuntimeError("Falta referencia Figura 41")
            parts.append(crop(16, 142, first[0].y0 - 9))
        final = stack(parts)
        dest = OUT / ("figura-%d.png" % number)
        final.save(dest, format="PNG", optimize=True)
        sizes[str(number)] = {"page": page_no, "width": final.width, "height": final.height, "bytes": dest.stat().st_size}
# Retain Figure 21 file from the previous approved integration.
if not (OUT / "figura-21.png").exists():
    raise RuntimeError("Falta Figura 21 preexistente")
(OUT / "anac-figuras-manifiesto.json").write_text(
    json.dumps({"source": URL, "sha256": source_sha, "figures": sizes, "figure_21": "preguntas-segun-raac-61-105.pdf página 52/108"}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print("Exportadas", len(sizes), "figuras originales, más Figura 21.")
