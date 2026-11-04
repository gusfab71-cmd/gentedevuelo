#!/usr/bin/env python3
"""Importa las instalaciones argentinas de OurAirports al catálogo revisable de AeroLocator.

Fuente comunitaria de dominio público: https://ourairports.com/data/
No certifica habilitaciones, frecuencias, pistas operativas, ATS ni aptitud para aterrizar.
La copia local preserva el ID de cada registro para mantener las revisiones de GdV.
Requiere solo Python 3 (stdlib). 
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import pathlib
import urllib.request

ROOT = "https://davidmegginson.github.io/ourairports-data"
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "aerolocator-ourairports-ar.json"


def read_csv(filename: str) -> list[dict[str, str]]:
    request = urllib.request.Request(
        f"{ROOT}/{filename}",
        headers={"User-Agent": "AeroLocator-GenteDeVuelo/1.0 (+https://gentedevuelo.com/)"},
    )
    with urllib.request.urlopen(request, timeout=70) as response:
        content = response.read()
    if len(content) > 18_000_000:
        raise RuntimeError(f"{filename} excede el tamaño permitido")
    return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig", errors="strict"))))


def number(text: str | None) -> float | None:
    if not text or not text.strip():
        return None
    try:
        result = float(text)
        if not (-10**12 < result < 10**12):
            return None
        return result
    except ValueError:
        return None


def airport(row: dict[str, str]) -> dict | None:
    if row.get("iso_country") != "AR":
        return None
    try:
        airport_id = int(row["id"])
    except (ValueError, KeyError):
        return None
    lat, lon = number(row.get("latitude_deg")), number(row.get("longitude_deg"))
    if not (lat is not None and lon is not None and -90 <= lat <= 0 and -85 <= lon <= -25):
        return None
    ident, name = row.get("ident", "").strip(), row.get("name", "").strip()
    if not ident or not name:
        return None
    kind = row.get("type", "").strip()
    return {
        "id": airport_id,
        "ident": ident,
        "type": kind,
        "name": name[:160],
        "lat": lat,
        "lon": lon,
        "region": row.get("iso_region", "")[:24],
        "municipality": row.get("municipality", "")[:90],
        "elevationFt": number(row.get("elevation_ft")),
        "scheduled": row.get("scheduled_service") == "yes",
        "icao": row.get("icao_code", "")[:8],
        "iata": row.get("iata_code", "")[:8],
        "gps": row.get("gps_code", "")[:12],
        "local": row.get("local_code", "")[:20],
        "keywords": row.get("keywords", "")[:280],
        "closed": kind in {"closed", "closed_airport"},
        "runways": [],
        "frequencies": [],
    }


def main() -> None:
    airports = read_csv("airports.csv")
    selected = {a["id"]: a for row in airports if (a := airport(row)) is not None}
    by_ident = {a["ident"]: a for a in selected.values()}
    if len(selected) < 100:
        raise RuntimeError("La fuente devolvió muy pocos registros de Argentina")
    counts = {"records": len(selected), "closed": 0, "heliports": 0, "runways": 0, "frequencies": 0}
    for row in read_csv("runways.csv"):
        try:
            parent = selected.get(int(row.get("airport_ref", "0"))) or by_ident.get(row.get("airport_ident", ""))
            runway_id = int(row["id"])
        except (ValueError, KeyError):
            continue
        if parent is None:
            continue
        runway = {
            "id": runway_id,
            "ident": "/".join(filter(None, (row.get("le_ident", ""), row.get("he_ident", "")))),
            "lengthFt": number(row.get("length_ft")),
            "widthFt": number(row.get("width_ft")),
            "surface": row.get("surface", "")[:42],
            "lighted": row.get("lighted") == "1",
            "closed": row.get("closed") == "1",
            "ends": [
                {"ident": row.get(f"{prefix}_ident", "")[:8],
                 "lat": number(row.get(f"{prefix}_latitude_deg")),
                 "lon": number(row.get(f"{prefix}_longitude_deg"))}
                for prefix in ("le", "he")
            ],
        }
        if not any(x["id"] == runway_id for x in parent["runways"]):
            parent["runways"].append(runway)
            counts["runways"] += 1
    for row in read_csv("airport-frequencies.csv"):
        try:
            parent = selected.get(int(row.get("airport_ref", "0"))) or by_ident.get(row.get("airport_ident", ""))
        except ValueError:
            parent = by_ident.get(row.get("airport_ident", ""))
        if parent is None:
            continue
        freq = number(row.get("frequency_mhz"))
        if freq is not None and not 1 <= freq <= 1000:
            continue
        parent["frequencies"].append({
            "type": row.get("type", "")[:28],
            "description": row.get("description", "")[:100],
            "mhz": freq,
        })
        counts["frequencies"] += 1
    data = sorted(selected.values(), key=lambda x: (x["name"].casefold(), x["id"]))
    counts["closed"] = sum(a["closed"] for a in data)
    counts["heliports"] = sum(a["type"] == "heliport" for a in data)
    timestamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    result = {
        "ok": True,
        "source": "OurAirports · dominio público / datos comunitarios",
        "sourceUrl": "https://ourairports.com/data/",
        "checkedUtc": timestamp,
        "downloadType": "Copia argentina de airports.csv, runways.csv y airport-frequencies.csv",
        "counts": counts,
        "warnings": [],
        "notice": "CATÁLOGO PARA REVISIÓN. No certifica existencia, apertura, habilitación ni servicios; corroborar ANAC/AIP/MADHEL/NOTAM.",
        "records": data,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    tmp.replace(OUTPUT)
    print(f"Importados registros de Argentina: {counts}, archivo {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
