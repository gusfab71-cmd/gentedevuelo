'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const {validManifest,frameUrl,animationIndices,MAX_NATIVE_ZOOM,MIN_FRAME_STEP_MS,boot}=
 require('../assets/aerometeo-radar.js');
const html=fs.readFileSync(path.join(root,'utilidades/aerometeo.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/aerometeo.css'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/aerometeo-app.js'),'utf8');
const stamp=Math.floor(Date.now()/1000/600)*600;
const manifest={version:'2.0',generated:stamp,host:'https://tilecache.rainviewer.com',
 radar:{past:[
  {time:stamp-1200,path:'/v2/radar/abcdef123456'},
  {time:stamp-600,path:'/v2/radar/abcdef234567'},
  {time:stamp,path:'/v2/radar/abcdef345678'}],
  nowcast:[{time:stamp+600,path:'/v2/radar/abcdef456789'}]}};

test('Solo teselas históricas RainViewer, sin futuros ni direcciones externas',()=>{
 const data=validManifest(manifest,stamp+180);
 assert.equal(data.host,'https://tilecache.rainviewer.com');
 assert.equal(data.frames.length,3);
 assert.equal(data.frames.at(-1).time,stamp);
 assert.equal(data.frames.some(f=>f.path.includes('abcdef456789')),false);
 assert.throws(()=>validManifest({...manifest,host:'http://tilecache.rainviewer.com'},stamp),/no está autorizado/);
 assert.throws(()=>validManifest({...manifest,host:'https://tiles.maliciosos.test'},stamp),/no está autorizado/);
 assert.throws(()=>validManifest({...manifest,radar:{past:[]}},stamp),/No hay imágenes/);
 assert.throws(()=>validManifest({...manifest,radar:{past:[
  {time:stamp,path:'/v2/radar/abcdef123456?x=bad'}]}},stamp),/No hay imágenes/);
});

test('Formato API vigente: esquema 2 y zoom nativo máximo 7',()=>{
 const data=validManifest(manifest,stamp);
 const url=frameUrl(data.host,data.frames[0]);
 assert.equal(url,'https://tilecache.rainviewer.com/v2/radar/abcdef123456/256/{z}/{x}/{y}/2/1_1.png');
 assert.equal(MAX_NATIVE_ZOOM,7);
 assert.ok(MIN_FRAME_STEP_MS>=6000);
 assert.deepEqual(animationIndices(13),[0,2,5,7,10,12]);
 assert.deepEqual(animationIndices(1),[0]);
 assert.throws(()=>frameUrl('https://example.com',data.frames[0]),/URL radar no válida/);
});

test('Radar es una capa independiente, fuera del visor de pronósticos y sin comenzar automáticamente',()=>{
 for(const id of ['aerometeo-radar-toggle','am-radar-panel','am-radar-status','am-radar-frame',
  'am-radar-time','am-radar-play','am-radar-prev','am-radar-next','am-radar-refresh'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/id="am-radar-panel"[^>]*hidden/);
 assert.match(html,/id="aerometeo-radar-toggle"[^>]*aria-pressed="false"/);
 assert.match(html,/assets\/aerometeo-radar\.js/);
 assert.match(app,/GDV_AEROMETEO_RADAR\?\.boot\(\{map,L\}\)/);
 assert.match(css,/\.am-radar-panel\[hidden\]/);
 assert.match(css,/\.am-radar-disclaimer/);
 assert.match(html,/class="am-radar-legend"/);
 assert.match(html,/role="img" aria-label="Cian y azul: ecos débiles a moderados/);
 assert.match(html,/Débil<\/span>/);
 assert.match(html,/Intenso<\/span>/);
 assert.match(css,/\.am-sidebar \.am-radar-legend\{/);
 assert.match(css,/\.am-sidebar \.am-radar-legend-scale\{/);
 assert.match(css,/height:7px/);
 assert.match(css,/linear-gradient\(90deg/);
 const radarStart=html.indexOf('<section id="am-radar-panel"');
 const sidebarStart=html.indexOf('<aside class="am-sidebar"');
 const sidebarEnd=html.indexOf('</aside>',sidebarStart);
 const mapStart=html.indexOf('<section class="am-map-section"');
 const canvasStart=html.indexOf('<div class="am-map-canvas">');
 assert.ok(radarStart>sidebarStart&&radarStart<sidebarEnd,
  'Los controles deben ocupar la columna izquierda, no el espacio del mapa');
 assert.ok(sidebarEnd<mapStart&&mapStart<canvasStart,
  'La sección del mapa permanece independiente del panel de radar');
 assert.ok(html.indexOf('id="aerometeo-radar-toggle"')<sidebarEnd);
 assert.match(css,/\.am-sidebar \.am-radar-panel\s*\{/);
 assert.match(css,/\.am-sidebar \.am-radar-player\{/);
 assert.match(html,/aerometeo\.css\?v=20261107radarlegend1/);
 assert.match(html,/solo pasado, no pronóstico ni alerta/i);
 assert.match(html,/RainViewer/);
 assert.match(html,/SMN/);
});

test('No consulta el servidor hasta que el usuario active el radar, y oculta capa al desactivar',async()=>{
 const ids=new Map();
 function elem(id){
  const listeners={};
  return {id,hidden:id==='am-radar-panel',disabled:false,value:'0',textContent:'',
   attributes:{},listeners,classList:{toggle(){}},
   addEventListener(name,fn){listeners[name]=fn},
   setAttribute(k,v){this.attributes[k]=v}};
 }
 for(const id of ['aerometeo-radar-toggle','am-radar-panel','am-radar-status','am-radar-frame',
  'am-radar-time','am-radar-play','am-radar-prev','am-radar-next','am-radar-refresh'])ids.set(id,elem(id));
 const prevDoc=global.document,prevFetch=global.fetch,prevAdd=global.addEventListener;
 let fetches=0,tiles=0,removed=0,url='',opts=null;
 global.document={getElementById:id=>ids.get(id),addEventListener() {},hidden:false};
 global.addEventListener=()=>{};
 global.fetch=async()=>{fetches++;return {ok:true,json:async()=>manifest}};
 const L={tileLayer:(tile,settings)=>{tiles++;url=tile;opts=settings;return {addTo(){},setUrl(x){url=x}}}};
 const map={removeLayer(){removed++}};
 try{
  const controller=boot({map,L});
  assert.ok(controller);
  assert.equal(fetches,0);
  assert.equal(tiles,0);
  ids.get('aerometeo-radar-toggle').listeners.click();
  await new Promise(r=>setImmediate(r));
  assert.equal(fetches,1);
  assert.equal(tiles,1);
  assert.match(url,/\/2\/1_1\.png$/);
  assert.equal(opts.maxNativeZoom,7);
  assert.match(opts.attribution,/RainViewer/);
  assert.equal(controller.state().frames,3);
  ids.get('aerometeo-radar-toggle').listeners.click();
  assert.equal(controller.state().enabled,false);
  assert.equal(removed,1);
  assert.equal(ids.get('am-radar-panel').hidden,true);
 }finally{
  global.document=prevDoc;global.fetch=prevFetch;global.addEventListener=prevAdd;
 }
});
