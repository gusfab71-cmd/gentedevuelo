#!/usr/bin/env python3
"""Build a review-only GeoJSON of Argentine radio navigation aids from OurAirports.

Run: python scripts/sync_ourairports_navaids_ar.py
Requires network access. Does not modify the database or deploy anything.
Output: assets/aerolocator-navaids-ar.geojson
OurAirports data is public domain; not authoritative for operational navigation.
"""
import csv
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE = "https://davidmegginson.github.io/ourairports-data/navaids.csv"
OUTPUT = Path("assets/aerolocator-navaids-ar.geojson")
TYPES = {"NDB", "NDB-DME", "VOR", "VOR-DME", "DME", "VORTAC", "TACAN"}

def main():
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "GenteDeVuelo-AeroLocator/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        data = response.read(8_000_001)
        if len(data) > 8_000_000:
            raise ValueError("OurAirports CSV excede el tamaño permitido")
        raw = data.decode("utf-8-sig")
    features = []
    for row in csv.DictReader(io.StringIO(raw)):
        if row.get("iso_country") != "AR" or row.get("type") not in TYPES:
            continue
        try:
            lat, lon = float(row["latitude_deg"]), float(row["longitude_deg"])
        except (KeyError, ValueError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        kind = row["type"]
        freq_khz = int(row["frequency_khz"]) if row.get("frequency_khz", "").isdigit() else None
        freq = (freq_khz if kind.startswith("NDB") else freq_khz / 1000) if freq_khz else None
        units = "kHz" if kind.startswith("NDB") else "MHz"
        features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"source_id": row.get("id"), "ident": row.get("ident"),
                "name": row.get("name"), "navaid_type": kind, "frequency": freq,
                "frequency_units": units, "dme_channel": row.get("dme_channel") or None,
                "associated_airport": row.get("associated_airport") or None,
                "source": "OurAirports", "verification_status": "unverified",
                "operational_status": "unknown"}})
    features.sort(key=lambda x: (x["properties"]["navaid_type"], x["properties"]["ident"] or ""))
    result = {"type": "FeatureCollection", "metadata": {
        "source": SOURCE, "generated_at": datetime.now(timezone.utc).isoformat(),
        "country": "AR", "operational_warning": "Refer to current AIP Argentina and NOTAM before flight"
    }, "features": features}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(features)} Argentine navaids to {OUTPUT}")

if __name__ == "__main__":
    main()
