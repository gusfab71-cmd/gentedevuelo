// Verificaciones de la capa informativa de radioayudas de AeroLocator.
// Ejecutar: node --test tests/aerolocator-navaids.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../api/aerolocator-navaids.js');
require('../assets/aerolocator-aip-radioaids-2026.js');
const official=globalThis.GDV_NAVAIDS_AIP;
const header='id,ident,name,type,frequency_khz,latitude_deg,longitude_deg,iso_country,dme_frequency_khz,dme_channel,associated_airport\n';
const input=header+
 '1,SVO,Santa Fe,NDB,405,-31.711,-60.811,AR,,,SAAV\n'+
 '2,EZE,Ezeiza,VOR-DME,116500,-34.82,-58.53,AR,116500,112X,SAEZ\n'+
 '3,AAA,Foreign,VOR,112000,-20,-50,BR,,,\n'+
 '4,BAD,No Position,VOR,113300,,,-AR,,,\n';
test('CSV incluye solo ayudas argentinas con coordenadas válidas y unidades apropiadas',()=>{
 const data=api._test.parseNavaids(input);
 assert.equal(data.length,2);
 const ndb=data.find(x=>x.ident==='SVO');
 const vor=data.find(x=>x.ident==='EZE');
 assert.equal(ndb.frequency,405);
 assert.equal(ndb.unit,'kHz');
 assert.equal(vor.frequency,116.5);
 assert.equal(vor.unit,'MHz');
 assert.equal(vor.dmeChannel,'112X');
 assert.equal(vor.dmePairMHz,116.5);
 assert.equal(ndb.operationalStatus,'unknown');
 assert.equal(vor.verification,'pending');
});
test('El parser maneja comas entrecomilladas y comillas dobles',()=>{
 const csv=header+'5,"AB","Campo, \"""\" Norte",NDB,330,-32,-60,AR,,,\n';
 const data=api._test.parseNavaids(csv);
 assert.equal(data.length,1);
 assert.equal(data[0].ident,'AB');
 assert.ok(data[0].name.includes('Campo,'));
});
test('El suplemento AIP se usa solo como cotejo documental',()=>{
 assert.equal(official.referenceDate,'2026-02-19');
 assert.equal(official.compare({type:'NDB',ident:'SVO',frequency:405}).status,'document-match');
 assert.equal(official.compare({type:'VOR-DME',ident:'EZE',frequency:116.5}).status,'document-match');
 assert.equal(official.compare({type:'VOR-DME',ident:'EZE',frequency:116.6}).status,'frequency-difference');
 assert.equal(official.compare({type:'VOR',ident:'PDI',frequency:114.1}).status,'not-compared');
 assert.equal(official.compare({type:'DME',ident:'XYZ',frequency:115.3}).status,'not-compared');
});
test('La API rechaza los métodos de escritura',async()=>{
 const req={method:'POST'};
 let status,body;
 const res={setHeader(){return this},status(code){status=code;return this},json(data){body=data;return data}};
 await api(req,res);
 assert.equal(status,405);
 assert.equal(body.ok,false);
});
