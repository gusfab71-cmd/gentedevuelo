#!/usr/bin/env python3
"""Import public official MADHEL records, keyed by ANAC national three-letter IDs.

The API may be unavailable. Never publish a partial snapshot; never store NOTAM
in static JSON because those notices expire.
"""
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT="https://datos.anac.gob.ar/madhel/api/v2/airports/"
CATALOG=Path("assets/aerolocator-anac-2026-ar.json")
OUT=Path("assets/aerolocator-anac-madhel-official.json")


def simple(value,limit=700):
    if value is None:return ""
    if isinstance(value,list):
        return " · ".join(simple(v,180) for v in value if v is not None)[:limit]
    if isinstance(value,dict):
        return json.dumps(value,ensure_ascii=False,separators=(",",":"))[:limit]
    return str(value).strip()[:limit]


def fetch_json(url):
    for attempt in range(2):
        try:
            request=Request(url,headers={"User-Agent":"GenteDeVuelo-AeroLocator/1.0",
                                         "Accept":"application/json"})
            with urlopen(request,timeout=18) as response:
                if int(response.status)!=200:raise ValueError(f"Unexpected HTTP {response.status}")
                body=response.read(1400000)
                return json.loads(body)
        except HTTPError as e:
            if e.code==404:return None
            if e.code in (429,500,502,503,504) and attempt==0:
                time.sleep(2);continue
            raise
        except (URLError, TimeoutError):
            if attempt==0:time.sleep(2);continue
            raise
    return None


def parse_record(local,data):
    if not isinstance(data,dict) or not isinstance(data.get("data"),dict):
        return None
    body=data["data"]
    metadata=data.get("metadata") or {}
    identifiers=metadata.get("identifiers") or {}
    canonical=simple(body.get("local") or identifiers.get("local") or local,10).upper()
    if canonical!=local:return None
    geocoords=metadata.get("localization") or {}
    coords=geocoords.get("coordinates") or {}
    lat,lon=coords.get("lat"),coords.get("lng")
    if not isinstance(lat,(float,int)) or not isinstance(lon,(float,int)):
        location=data.get("the_geom") or {}
        geom=location.get("geometry") or {}
        pair=geom.get("coordinates") or []
        if len(pair)==2:lon,lat=pair
    if not isinstance(lat,(float,int)) or not isinstance(lon,(float,int)):
        return None
    if not (-67<=lat<=-21 and -75<=lon<=-52):return None
    norms=body.get("norms") or {}
    if not isinstance(norms,dict):norms={}
    helper=body.get("helpers_system") or {}
    if not isinstance(helper,dict):helper={}
    def txt(field,lim=1000):return simple(body.get(field),lim)
    obj={
     "local":local,
     "icao":simple(identifiers.get("icao"),8),
     "iata":simple(identifiers.get("iata"),8),
     "name":simple(data.get("human_readable_identifier") or body.get("human_readable_identifier"),160),
     "lat":round(float(lat),7),"lon":round(float(lon),7),
     "updated":simple(data.get("updated_at"),40),
     "status":simple(metadata.get("status"),50),
     "condition":simple(metadata.get("condition"),100),
     "control":simple(metadata.get("control"),100),
     "fir":simple(geocoords.get("fir"),12),
     "regional":simple(geocoords.get("region"),12),
     "usage":simple(metadata.get("usage"),100),
     "sna":metadata.get("sna") if isinstance(metadata.get("sna"),bool) else None,
     "rwy":txt("rwy",1700),
     "thr":txt("thr",1000),
     "declared_distances":txt("rwy_declared_distances",1700),
     "fato":txt("fato",1000),
     "tlof":txt("tlof",1000),
     "twy":txt("twy",1000),
     "apn":txt("apn",700),
     "ats":txt("ats",1300),
     "radioaids":simple(helper.get("radio"),1000),
     "visual_aids":simple(helper.get("visual"),800),
     "fuel":txt("fuel",500),
     "service_schedule":txt("service_schedule",700),
     "telephone":txt("telephone",600),
     "sei":txt("sei_category",60),
     "atz":txt("atz",200),
     "norms_general":simple(norms.get("general",{}).get("content"),2300) if isinstance(norms.get("general"),dict) else "",
     "norms_particular":simple(norms.get("particular",{}).get("content"),3000) if isinstance(norms.get("particular"),dict) else "",
    }
    return obj


def main():
    base=json.loads(CATALOG.read_text(encoding="utf-8"))
    codes=sorted({str(row[14]).strip().upper() for row in base["rows"] if re.fullmatch(r"[A-Z0-9]{3}",str(row[14]).strip().upper())})
    if len(codes)<550:raise ValueError("ANAC 2026 base codes incomplete")
    results=[];errors=[];missing=[]
    for index,code in enumerate(codes,1):
        try:
            raw=fetch_json(ROOT+quote(code,safe="")+"/?format=json")
            if raw is None:missing.append(code)
            else:
                parsed=parse_record(code,raw)
                if parsed:results.append(parsed)
                else:errors.append(code+": unexpected shape or geo")
        except Exception as ex:
            errors.append(code+": "+type(ex).__name__)
        time.sleep(.4)
    if len(results)<200 or len(errors)>len(codes)*.1:
        raise ValueError(f"MADHEL source incomplete. {len(results)} ok, {len(errors)} errors, {len(missing)} missing. Keeping last good snapshot.")
    result={
     "schema":1,
     "source":ROOT,
     "extractedAt":datetime.now(timezone.utc).isoformat(timespec="seconds"),
     "reference":"Madhel electrónico ANAC · actualización individual en cada registro",
     "note":"Datos documentales. Para operaciones, verificar MADHEL/AIP/NOTAM vigentes; NOTAM temporales no se almacenan.",
     "attempted":len(codes),"count":len(results),"errors":errors[:30],"notFound":len(missing),"records":results
    }
    OUT.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf8")
    print("ANAC MADHEL:",len(results),"loaded,",len(errors),"failures,",len(missing),"not found")


if __name__=="__main__":
    main()
