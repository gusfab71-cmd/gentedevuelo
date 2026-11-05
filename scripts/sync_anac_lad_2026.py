#!/usr/bin/env python3
"""Import official ANAC LAD/LADH/LADA September 2026 PDF into a verified snapshot.

An LAD is not a certified aerodrome. Registry only, operational status unknown.
Fail closed if PDF layout or record counts change.
"""
import argparse
import json
import re
from collections import Counter
from pathlib import Path
from urllib.request import Request, urlopen

import fitz

SOURCE = "https://www.argentina.gob.ar/sites/default/files/listado_lad_2026-09.pdf"
EDITION = "2026-09-28"
# Column boundaries as fractions of landscape PDF page width, first to last.
# N°, type, registry, name, runway, dimensions, surface, elevation, latitude,
# longitude, geographic reference, ANAC regional office.
COLUMNS = [.060,.086,.119,.171,.314,.360,.441,.501,.560,.620,.686,.898,.956]
TYPES = {"LAD", "LADH", "LADA"}


def coordinate(value, is_latitude):
    value = "".join(str(value).upper().split()).replace(",", ".")
    m = re.fullmatch(r"(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSWE])", value)
    if not m:
        return None
    d, mm, ss, hemisphere = float(m[1]), float(m[2]), float(m[3]), m[4]
    if (is_latitude and hemisphere not in "NS" or
            not is_latitude and hemisphere not in "EW" or
            d > (90 if is_latitude else 180) or mm >= 60 or ss >= 60):
        return None
    return round((d + mm / 60 + ss / 3600) * (-1 if hemisphere in "SW" else 1), 7)


def cell(page, a, b, top, bottom):
    width = page.rect.width
    box = fitz.Rect((a + .0007) * width, top, (b - .0007) * width, bottom)
    return re.sub(r"\s+", " ", page.get_textbox(box)).strip()


def extract_page(page):
    width, height = page.rect.width, page.rect.height
    # The leftmost column contains only ordinal row numbers.
    anchors = []
    for w in page.get_text("words", sort=True):
        x0, y0, x1, y1, value = w[:5]
        x = (x0+x1)/(2*width)
        y = (y0+y1)/(2*height)
        if .062 < x < .085 and .06 < y < .96 and re.fullmatch(r"\d{1,4}", value):
            anchors.append((y0, int(value)))
    anchors.sort()
    output = []
    for index, (start, n) in enumerate(anchors):
        next_start = anchors[index+1][0] if index+1 < len(anchors) else .96*height
        bottom = max(min(next_start-1, start+36), start+9)
        columns = [cell(page, COLUMNS[i], COLUMNS[i+1], start-1, bottom)
                   for i in range(12)]
        if columns[1] not in TYPES or not re.fullmatch(r"\d+", columns[2]):
            continue
        latitude = coordinate(columns[8], True)
        longitude = coordinate(columns[9], False)
        if latitude is None or longitude is None:
            raise ValueError(f"LAD row {n} page {page.number+1}: bad coordinates: {columns!r}")
        matches = re.findall(r"\d+(?:[,.]\d+)?", columns[5])
        size = [float(v.replace(",", ".")) for v in matches]
        output.append({
            "row":n,
            "type":columns[1],
            "registry":int(columns[2]),
            "name":columns[3],
            "runway":columns[4],
            "dimensions_raw":columns[5],
            "length_m":size[0] if len(size)>0 else None,
            "width_m":size[1] if len(size)>1 else None,
            "surface":columns[6],
            "elevation_raw":columns[7],
            "lat":latitude,
            "lon":longitude,
            "location":columns[10],
            "region":columns[11],
            "page":page.number+1,
        })
    return output


def extract(path):
    rows=[]
    with fitz.open(path) as pdf:
        if not 40 <= len(pdf) <= 60:
            raise ValueError(f"Unexpected ANAC LAD page count {len(pdf)}")
        for page in pdf:
            rows.extend(extract_page(page))
    ordinals = [r["row"] for r in rows]
    if len(ordinals) < 900 or len(set(ordinals)) != len(ordinals):
        raise ValueError(f"Could not reconcile LAD rows: {len(rows)}, {len(set(ordinals))} unique")
    missing = sorted(set(range(1, max(ordinals)+1)) - set(ordinals))
    if missing:
        raise ValueError("Missing official LAD rows: " + str(missing[:30]))
    # Allow Argentine Antarctic installations; never silently discard outliers.
    invalid = [r for r in rows if
        not (-67 <= r["lat"] <= -21 and -75 <= r["lon"] <= -52) or not r["name"]]
    if invalid:
        raise ValueError("Geographic anomalies: " + repr(invalid[:5]))
    return sorted(rows, key=lambda row:row["row"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", default="")
    parser.add_argument("--output", default="assets/aerolocator-anac-lad-2026-ar.json")
    args=parser.parse_args()
    pdf=Path(args.pdf or "/tmp/aerolocator-lad-2026.pdf")
    if not args.pdf:
        request=Request(SOURCE, headers={"User-Agent":"GenteDeVuelo-AeroLocator/1.0"})
        with urlopen(request, timeout=60) as resp:
            data=resp.read()
        if not data.startswith(b"%PDF") or len(data)<100000:
            raise ValueError("Official ANAC LAD source did not return a valid PDF")
        pdf.write_bytes(data)
    rows=extract(pdf)
    snapshot={
        "schema":1, "edition":EDITION,"source":SOURCE,
        "title":"Listado de Lugares Aptos Denunciados (ANAC, 28 septiembre 2026)",
        "note":"Geographic registry only: NOT a certified aerodrome or operational authorization.",
        "count":len(rows), "counts":dict(Counter(r["type"] for r in rows)),
        "records":rows,
    }
    output=Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    content=json.dumps(snapshot,ensure_ascii=False,separators=(",",":"))+"\n"
    if output.is_file() and output.read_text(encoding="utf8")==content:
        print("Unchanged LAD registry",len(rows))
    else:
        output.write_text(content,encoding="utf8")
        print("Extracted",len(rows),"LAD/LADH/LADA records from",pdf)


if __name__=="__main__":
    main()
