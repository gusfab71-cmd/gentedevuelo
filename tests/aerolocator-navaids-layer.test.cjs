// Prueba de regresión: radioayudas como vista exclusiva, sin alterar PRONAREA.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'utilidades/pistas-no-oficiales.html'),'utf8');
const js=fs.readFileSync(path.join(base,'assets/aerolocator-navaids-layer.js'),'utf8');
require('../assets/aerolocator-navaids-layer.js');
const layer=globalThis.GDV_NAVAIDS_LAYER;

test('El menú presenta radioayudas en una vista separada de PRONAREA',()=>{
 assert.match(html,/<option value="navaids">Radioayudas · NDB \/ VOR \/ DME<\/option>/);
 assert.match(html,/<option value="pronarea">PRONAREA · Planificador de vuelo VFR<\/option>/);
 assert.match(html,/\['airfields','ourairports','sigmet','pronarea','navaids','openaip-airspaces','openaip-points'\]/);
 assert.match(html,/if\(next!=='navaids'\)radioayudas\?\.hide\(\)/);
 assert.match(html,/else if\(next==='navaids'\)/);
 assert.match(html,/void radioayudas\.show\(\)/);
});
test('El panel de radioayudas y sus filtros tienen identificadores únicos',()=>{
 for(const kind of ['ndb','vor','dme'])
  assert.equal((html.match(new RegExp('data-navaid-kind="'+kind+'"','g'))||[]).length,1);
 assert.equal((html.match(/id="navaid-controls"/g)||[]).length,1);
 assert.match(html,/class="navaid-control-box"[^>]*hidden/);
 assert.match(html,/navaid-control-box\[hidden\]\{display:none!important\}/);
 assert.match(js,/group=L\.layerGroup\(\)/);
 assert.match(js,/map\.removeLayer\(group\)/);
});
test('Simbolización NDB, VOR y DME es diferente y legible',()=>{
 assert.match(layer.iconSvg('NDB'),/<circle/);
 assert.match(layer.iconSvg('VOR'),/<polygon/);
 assert.match(layer.iconSvg('DME'),/<rect/);
 assert.notEqual(layer.iconSvg('NDB'),layer.iconSvg('VOR'));
});
test('Filtrado respeta radioayudas combinadas y evita mezclas',()=>{
 const vor={type:'VOR'},ndb={type:'NDB'},dme={type:'DME'};
 const combo={type:'VOR-DME'};
 assert.equal(layer.allowed(vor,{ndb:true,vor:false,dme:false}),false);
 assert.equal(layer.allowed(ndb,{ndb:true,vor:false,dme:false}),true);
 assert.equal(layer.allowed(dme,{ndb:false,vor:false,dme:true}),true);
 assert.equal(layer.allowed(combo,{ndb:false,vor:false,dme:true}),true);
 assert.equal(layer.allowed(combo,{ndb:false,vor:false,dme:false}),false);
});
test('La fuente no se presenta como verificación de aptitud operacional',()=>{
 assert.match(js,/Estado operativo/);
 assert.match(js,/Desconocido\. No utilizar como fuente de navegación/);
 assert.match(js,/Consultar NOTAM/);
 assert.match(html,/https:\/\/ais\.anac\.gob\.ar\/aip/);
});
test('Se conserva el panel PRONAREA y el enlace encima del campo de texto',()=>{
 assert.match(html,/class="pronarea-official-link"/);
 assert.ok(html.indexOf('class="pronarea-official-link"')<html.indexOf('for="pronarea-map-input"'));
 assert.match(html,/document\.getElementById\('route-planner-panel'\)\.open=false/);
});
