#!/usr/bin/env python3
"""Snapshot of ANAC / Ministerio de Transporte 2021 historical aerodrome list.

Historical use, control, FIR, and aerodrome status are NOT current validation.
Fail closed when source structure or content changes.
"""
import json
import re
import unicodedata
from pathlib import Path
from urllib.request import Request,urlopen

from bs4 import BeautifulSoup

SOURCE='https://servicios.transporte.gob.ar/gobierno_abierto/detalle.php?d=detalle&t=aeropuertos'
EDITION='2021-09'

def norm(text):
    text=unicodedata.normalize('NFD',str(text or '').strip().lower())
    return re.sub(r'\s+',' ',''.join(x for x in text if unicodedata.category(x)!='Mn'))

def coord_from_arp(value):
    value=norm(value).upper()
    tokens=re.findall(r'(\d{1,3})\s*[°º]\s*(\d{1,2})\s*[\'’]\s*(\d{1,2}(?:[,.]\d+)?)\s*["″]?\s*([NSWE])',value)
    result={}
    for degrees,minutes,seconds,axis in tokens:
        d=float(degrees)+float(minutes)/60+float(seconds.replace(',','.'))/3600
        d*=(-1 if axis in 'SW' else 1)
        result['lat' if axis in 'NS' else 'lon']=round(d,7)
    if 'lat' not in result or 'lon' not in result:return None
    lat,lon=result['lat'],result['lon']
    if not (-66<=lat<=-21 and -75<=lon<=-52):return None
    return lat,lon

def parse(html):
    soup=BeautifulSoup(html,'html.parser')
    rows=[]
    keys={
      'local':'designador local','icao':'designador oaci','iata':'designador iata',
      'type':'tipo','name':'denominacion','arp':'arp','condition':'condicion',
      'control':'control','regional':'regional','fir':'fir','use':'uso',
      'traffic':'trafico','sna':'sna','concession':'concesionado',
      'disabled':'inhabilitado','province':'provincia'
    }
    for table in soup.find_all('table'):
        trs=table.find_all('tr')
        if not trs:continue
        heads=[norm(c.get_text(' ',strip=True)) for c in trs[0].find_all(['td','th'])]
        if not {'designador oaci','condicion','control','fir','denominacion'}.issubset(set(heads)):
            continue
        ix={key:heads.index(value) for key,value in keys.items() if value in heads}
        if not {'icao','name','arp','condition','control','fir'}.issubset(ix):
            raise ValueError('ANAC 2021 table missing required headers')
        for tr in trs[1:]:
            cells=[c.get_text(' ',strip=True) for c in tr.find_all(['td','th'],recursive=False)]
            if len(cells)<len(heads):continue
            def get(key):return cells[ix[key]].strip() if key in ix else ''
            arp=coord_from_arp(get('arp'))
            if not arp:continue
            if not get('name'):continue
            rows.append([
                get('local'),get('icao'),get('iata'),get('name'),arp[0],arp[1],
                get('condition'),get('control'),get('regional'),get('fir'),
                get('use'),get('traffic'),get('sna'),get('concession'),
                get('disabled'),get('province')
            ])
        break
    if len(rows)<400 or len(rows)>3000:
        raise ValueError('ANAC 2021 list missing/incomplete: '+str(len(rows)))
    return rows

def main():
    req=Request(SOURCE,headers={'User-Agent':'GenteDeVuelo-AeroLocator/1.0'})
    with urlopen(req,timeout=60) as response:
        html=response.read().decode('utf-8','replace')
    rows=parse(html)
    result={'schema':1,'edition':EDITION,'source':SOURCE,'count':len(rows),
      'fields':['local','icao','iata','name','lat','lon','condition','control',
                'regional','fir','use','traffic','sna','concession','disabled','province'],
      'note':'2021 HISTORICAL data; not evidence of current permissions, ATS, restrictions, or opening.',
      'rows':rows}
    path=Path('assets/aerolocator-anac-historical-2021.json')
    raw=json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n'
    if path.is_file() and path.read_text(encoding='utf-8')==raw:
        print('No change: ANAC 2021',len(rows))
    else:
        path.write_text(raw,encoding='utf-8')
        print('Parsed ANAC 2021',len(rows))

if __name__=='__main__':
    main()
