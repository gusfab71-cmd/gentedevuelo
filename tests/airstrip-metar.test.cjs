const assert=require('node:assert/strict');
const handler=require('../api/airstrip-metar.js');
const {validCoordinate,bboxAround,nmBetween,pickNearest,parseObservationTime}=handler._test;
assert.equal(validCoordinate(-34.9,-57.9),true);
assert.equal(validCoordinate(-14,-57.9),false);
assert.equal(validCoordinate(0,0),false);
assert.equal(nmBetween(-34.9,-57.9,-34.9,-57.9),0);
assert.ok(nmBetween(-34.9,-57.9,-34.8,-57.8)<10);
assert.equal(bboxAround(-34,-58).split(',').length,4);
const now=Date.UTC(2026,9,25,19,0,0);
const reports=[
 {icaoId:'SABE',lat:-34.559,lon:-58.416,obsTime:now/1000-600,rawOb:'METAR SABE 251850Z 15008KT 9999 SCT030 21/10 Q1013'},
 {icaoId:'SAME',lat:-32.829,lon:-68.792,obsTime:now/1000-600,rawOb:'METAR SAME 251850Z 15008KT 9999 SCT030'},
 {icaoId:'SAEZ',lat:-34.82,lon:-58.54,obsTime:now/1000-8000,rawOb:'METAR SAEZ 251650Z 14011KT 9999 SCT040'}
];
const nearest=pickNearest(reports,-34.56,-58.42,now);
assert.equal(nearest.station,'SABE');
assert.equal(nearest.freshness,'recent');
assert.ok(nearest.distanceNm<1);
assert.equal(nearest.observationUtc,new Date(now-600000).toISOString());
assert.equal(parseObservationTime(now/1000),now);
assert.equal(pickNearest([{...reports[0],obsTime:now/1000-86400}],-34.5,-58.4,now),null);
const stale=pickNearest([{...reports[0],obsTime:now/1000-4*3600}],-34.5,-58.4,now);
assert.equal(stale.freshness,'stale');
assert.equal(pickNearest([{...reports[0],obsTime:null,reportTime:null}],-34.5,-58.4,now),null);
assert.equal(pickNearest([{...reports[0],lat:1,lon:1}],-34.5,-58.4,now),null);
async function request(method,query,fetcher){
 const previous=global.fetch;
 global.fetch=fetcher;
 const headers={};
 const res={setHeader(k,v){headers[k]=v;},status(value){this.code=value;return this;},json(body){this.body=body;return this;}};
 try{await handler({method,query},res);return {...res,headers}}
 finally{global.fetch=previous}
}
(async()=>{
 let requests=0;
 const responseRows=reports.map(row=>({...row,obsTime:Math.floor(Date.now()/1000)-600}));
 const valid=await request('GET',{lat:'-34.56',lon:'-58.42'},async url=>{
  requests++;
  const parsed=new URL(url);
  assert.equal(parsed.hostname,'aviationweather.gov');
  assert.equal(parsed.pathname,'/api/data/metar');
  assert.equal(parsed.searchParams.get('format'),'json');
  assert.ok(parsed.searchParams.get('bbox'));
  return {ok:true,json:async()=>responseRows};
 });
 assert.equal(valid.code,200);
 assert.equal(valid.body.available,true);
 assert.equal(valid.body.station,'SABE');
 assert.equal(valid.body.freshness,'recent','El informe recién emitido se considera reciente.');
 assert.equal(requests,1);
 const invalid=await request('GET',{lat:'100',lon:'-57'},async()=>{throw Error('No consultar')});
 assert.equal(invalid.code,400);
 const noPost=await request('POST',{lat:'-34',lon:'-58'},async()=>{throw Error('No consultar')});
 assert.equal(noPost.code,405);
 const down=await request('GET',{lat:'-37.123',lon:'-63.234'},async()=>{throw Error('offline')});
 assert.equal(down.code,503);
 const missing=await request('GET',{lat:'-35.913',lon:'-59.831'},async()=>({status:204,ok:true}));
 assert.equal(missing.code,200);
 assert.equal(missing.body.available,false);
 assert.equal(missing.body.maxDistanceNm,120);
 console.log('PASS: METAR AWC cercano, ICAO, NM, UTC, antigüedad, CORS proxy, sin datos y límites');
})().catch(error=>{console.error(error);process.exitCode=1});
