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

test('AeroLocator presenta cotas en tarjeta flotante y permite cerrarla u ocultarla',async()=>{
 const fakeElement=tag=>({
  tagName:tag,children:[],listeners:{},attributes:{},hidden:false,checked:false,textContent:'',
  append(...nodes){this.children.push(...nodes)},
  setAttribute(key,value){this.attributes[key]=value},
  addEventListener(name,callback){this.listeners[name]=callback}
 });
 const toggle=fakeElement('input');
 const container=fakeElement('div');
 const handlers={};
 let layerAdded=false,layerRemoved=false;
 const L={
  tileLayer:()=>({addTo(){layerAdded=true}}),
  DomEvent:{disableClickPropagation(){},disableScrollPropagation(){}}
 };
 const map={
  getContainer:()=>container,
  on(event,handler){handlers[event]=handler},
  removeLayer(){layerRemoved=true}
 };
 const document={
  getElementById(id){return id==='terrain-aerolocator-toggle'?toggle:null},
  createElement:fakeElement
 };
 const fetch=async()=>({ok:true,json:async()=>({points:[{lat:-32.85,lng:-69.2,elevation_m:4230}]})});
 const window={};
 vm.runInNewContext(js,{window,document,fetch});
 const controller=window.GDV_TERRAIN.bootAeroLocator({map,L,readRouteState:()=>({drawing:false})});
 assert.ok(controller);
 const card=controller.card;
 assert.equal(card.id,'terrain-aerolocator-card');
 assert.equal(card.hidden,true,'La tarjeta no debe mostrarse al cargar la página');
 assert.equal(toggle.checked,false,'La capa debe iniciar apagada');
 toggle.checked=true;
 toggle.listeners.change();
 assert.equal(layerAdded,true);
 await handlers.click({latlng:{lat:-32.85,lng:-69.2}});
 assert.equal(card.hidden,false);
 const texts=[];
 function gather(node){texts.push(node.textContent);for(const child of node.children||[])gather(child)}
 gather(card);
 assert.ok(texts.some(value=>value.includes('4.230')),'Debe informar 4.230 metros');
 assert.ok(texts.some(value=>value.includes('13.878')),'Debe informar 13.878 pies');
 assert.ok(texts.some(value=>value.includes('SRTM')),'Debe informar procedencia numérica');
 const close=card.children[0].children[1];
 close.listeners.click();
 assert.equal(card.hidden,true,'El botón cerrar debe ocultar la tarjeta');
 await handlers.click({latlng:{lat:-32.85,lng:-69.2}});
 assert.equal(card.hidden,false);
 toggle.checked=false;
 toggle.listeners.change();
 assert.equal(card.hidden,true,'Al apagar la capa se cierra la tarjeta');
 assert.equal(layerRemoved,true);
});
test('la tarjeta es responsive y no aparece en la barra superior',()=>{
 const css=read('assets/terrain-relief.css');
 assert.match(css,/\.terrain-float-card\s*\{/);
 assert.match(css,/\.terrain-float-card\[hidden\]/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(aero,/aria-describedby="terrain-aerolocator-card"/);
 assert.doesNotMatch(aero,/terrain-aerolocator-readout/);
});

test('El perfil SVG comienza con MoveTo para evitar un trazado inválido',()=>{
 assert.match(js,/validPoints\.map\(\(p,validIndex\)=>/);
 assert.match(js,/validIndex===0\?\s*'M':'L'/);
});
