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
        # The official PDF has tight column boundaries crossing OCR-like
        # text spans. Read both full coordinates from ONE wide rectangle:
        # isolated column crops can turn 283428,00S into 2 | 83428,00S.
        complete = cell(page, .500, .895, start-1, bottom)
        lat_match = re.search(r"(?<!\d)\d{6}(?:[.,]\d+)?[NS]", complete)
        lon_match = re.search(r"(?<!\d)\d{7}(?:[.,]\d+)?[EW]", complete)
        latitude = coordinate(lat_match.group(), True) if lat_match else None
        longitude = coordinate(lon_match.group(), False) if lon_match else None
        # Some published LAD entries intentionally have 000000S/0000000W or
        # lack coordinates. Preserve their source row in quarantine rather than
        # inventing a point or rejecting the rest of the official list.
        elevation_match = re.search(r"\d+(?:[.,]\d+)?\s*(?:mts?\.?|m\.?)",columns[7],re.I)
        if elevation_match:columns[7]=elevation_match.group().strip()
        region_match = re.search(r"\bDR(?:CE|NO|NE|SU)\b", cell(page,.85,.958,start-1,bottom),re.I)
        if region_match:columns[11]=region_match.group().upper()
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
    # Allow Antarctic installations while isolating zero/missing/out-of-range
    # locations as quarantined source rows.
    quarantine=[r for r in rows if
        r["lat"] is None or r["lon"] is None or
        not (-67 <= r["lat"] <= -21 and -75 <= r["lon"] <= -52) or not r["name"]]
    valid=[r for r in rows if r not in quarantine]
    if len(quarantine)>30 or len(valid)<900:
        raise ValueError(f"Too many anomalous LAD rows: {len(quarantine)}; {len(valid)} usable")
    return sorted(valid, key=lambda row:row["row"]),sorted(quarantine,key=lambda row:row["row"])


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
    rows,quarantine=extract(pdf)
    snapshot={
        "schema":1, "edition":EDITION,"source":SOURCE,
        "title":"Listado de Lugares Aptos Denunciados (ANAC, 28 septiembre 2026)",
        "note":"Geographic registry only: NOT a certified aerodrome or operational authorization.",
        "count":len(rows), "sourceCount":len(rows)+len(quarantine),
        "quarantined":len(quarantine),"quarantine":quarantine,
        "counts":dict(Counter(r["type"] for r in rows)),
        "records":rows,
    }
    output=Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    content=json.dumps(snapshot,ensure_ascii=False,separators=(",",":"))+"\n"
    if output.is_file() and output.read_text(encoding="utf8")==content:
        print("Unchanged LAD registry",len(rows))
    else:
        output.write_text(content,encoding="utf8")
        print("Extracted",len(rows),"usable LAD/LADH/LADA records from",pdf,
              ";",len(quarantine),"quarantined records remain without map pin")


if __name__=="__main__":
    main()
