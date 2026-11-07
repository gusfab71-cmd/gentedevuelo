'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const js=read('assets/terrain-relief.js');
const aero=read('utilidades/pistas-no-oficiales.html');
const flight=read('utilidades/meteorologia-aeronautica.html');
const api=read('api/terrain-elevation.js');
function moduleUnderTest(){
 const window={};
 vm.runInNewContext(js,{window});
 return window.GDV_TERRAIN;
}
test('se muestran controles de capa independientes y apagados por defecto',()=>{
 for(const [doc,id] of [[aero,'terrain-aerolocator-toggle'],[flight,'flight-terrain-toggle']]){
  const input=doc.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0];
  assert.ok(input,'Falta '+id);
  assert.doesNotMatch(input,/\schecked(?:=|\s|>)/);
 }
 assert.match(aero,/bootAeroLocator/);
 assert.match(flight,/bootFlightOperations/);
 assert.match(flight,/id="flight-terrain-profile"/);
});
test('los datos del mapa topográfico provienen del IGN y las cotas no se atribuyen al IGN',()=>{
 const terrain=moduleUnderTest();
 const t=terrain.ignLayer({tileLayer:(url,opts)=>({url,opts})});
 assert.match(t.url,/wms\.ign\.gob\.ar/);
 assert.match(t.url,/mapabase_topo/);
 assert.match(js,/SRTM 30 m \(NASA\/USGS mediante OpenTopoData\)/);
 assert.match(js,/no IGN/i);
});
test('las muestras respetan extremos, número máximo y monotonía de distancia',()=>{
 const terrain=moduleUnderTest();
 const points=terrain.sampleRoute([{lat:-32.8317,lng:-68.7928},{lat:-34.5878,lng:-68.4036}]);
 assert.equal(points.length,60);
 assert.ok(Math.abs(points[0].lat+32.8317)<0.00001);
 assert.ok(Math.abs(points[59].lat+34.5878)<0.00001);
 assert.ok(points.every((p,i)=>i===0||p.distance_nm>=points[i-1].distance_nm));
 assert.deepEqual(Array.from(terrain.sampleRoute([{lat:80,lng:20},{lat:-34,lng:-59}])),[]);
});
function handler(fetchMock){
 const sandbox={module:{exports:{}},fetch:fetchMock,AbortController:class{constructor(){this.signal={}}abort(){}},
  setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(api,sandbox);
 return sandbox.module.exports;
}
function response(){
 return {statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
}
test('API impide método no permitido y coordenadas ajenas a Argentina',async()=>{
 const fn=handler(async()=>{throw Error('No debe consultar el proveedor')});
 const method=response();await fn({method:'POST',query:{}},method);assert.equal(method.statusCode,405);
 const wrong=response();await fn({method:'GET',query:{locations:'40,5'}},wrong);assert.equal(wrong.statusCode,400);
 const tooMany=response();await fn({method:'GET',query:{locations:Array.from({length:61},()=>'-34,-58').join('|')}},tooMany);
 assert.equal(tooMany.statusCode,400);
});
test('API solo invoca el proveedor fijo y conserva 2 cotas recibidas',async()=>{
 let upstream='';
 const fn=handler(async url=>{
  upstream=url;
  return {ok:true,json:async()=>({status:'OK',results:[{elevation:100},{elevation:125}]})};
 });
 const res=response();await fn({method:'GET',query:{locations:'-34.6,-58.4|-34.7,-58.3'}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.points[1].elevation_m,125);
 assert.match(upstream,/^https:\/\/api\.opentopodata\.org\/v1\/srtm30m\?/);
});
test('despliegue automático de Vercel queda limitado a main',()=>{
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.git.deploymentEnabled['*'],false);
 assert.equal(config.git.deploymentEnabled.main,true);
});
