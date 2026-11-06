const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'utilidades/pistas-no-oficiales.html'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/aerolocator-openaip-catalog/index.ts'),'utf8');
const layerJS=fs.readFileSync(path.join(root,'assets/aerolocator-openaip-layers.js'),'utf8');
const navaidJS=fs.readFileSync(path.join(root,'assets/aerolocator-navaids-layer.js'),'utf8');
require('../assets/aerolocator-openaip-layers.js');
const api=globalThis.GDV_OPENAIP_LAYERS;

test('La interfaz conserva las capas originales y agrega dos vistas independientes',()=>{
 for(const mode of ['airfields','navaids','ourairports','sigmet','pronarea','openaip-airspaces','openaip-points'])
  assert.match(html,new RegExp('<option value="'+mode+'">'));
 assert.match(html,/if\(next!=='openaip-airspaces'&&next!=='openaip-points'\)openAipLayers\?\.hide\(\)/);
 assert.match(html,/if\(next!=='navaids'\)radioayudas\?\.hide\(\)/);
 assert.match(html,/route-planner-panel'\)\.open=false/);
 assert.match(html,/class="pronarea-official-link"/);
});
test('Normalizador de radioayudas no confunde DVOR con NDB',()=>{
 assert.equal(api.navaidType(2),'NDB');
 assert.equal(api.navaidType(3),'VOR');
 assert.equal(api.navaidType(7),'VOR-DME');
 assert.equal(api.navaidType(0),'DME');
 assert.equal(api.navaidType(50),null);
});
test('Cruce de radioayudas exige identificador, tipo compatible y cercanía',()=>{
 const records=[
  {ident:'ABC',type:'VOR',lat:-31.71,lon:-60.81},
  {ident:'XYZ',type:'NDB',lat:-33.4,lon:-61.4}
 ];
 assert.equal(api.matchNavaid(records,{ident:'ABC',type:4,coordinates:[-60.80,-31.72]}),0);
 assert.equal(api.matchNavaid(records,{ident:'ABC',type:2,coordinates:[-60.80,-31.72]}),-1);
 assert.equal(api.matchNavaid(records,{ident:'ABC',type:4,coordinates:[-59.80,-31.72]}),-1);
 assert.equal(api.matchNavaid(records,{ident:'DEF',type:4,coordinates:[-60.80,-31.72]}),-1);
});
test('No se sobrescriben fuentes existentes ni se duplican puntos cotejados',()=>{
 assert.match(navaidJS,/const existing=root\.GDV_OPENAIP_LAYERS\.matchNavaid/);
 assert.match(navaidJS,/entries\[existing\]\.item\.openaip=candidate/);
 assert.match(navaidJS,/if\(existing>=0\)/);
 assert.match(navaidJS,/const documentary=aip\?\.documentaryExtras\(records\)/);
 assert.match(navaidJS,/if\(active\)statusUpdate\(staleSource\)/);
});
test('La función solo permite categorías, región y páginas acotadas',()=>{
 assert.match(edge,/new Set\(\["navaids", "airspaces", "reporting-points"\]\)/);
 assert.match(edge,/page > 8/);
 assert.match(edge,/endpoint\.searchParams\.set\("country", "AR"\)/);
 assert.match(edge,/const pageLimit = kind === "airspaces" \? 100 : 250/);
 assert.match(edge,/responseCache\.set/);
 assert.match(edge,/verifiedUserId/);
 assert.match(edge,/site_admins/);
 assert.match(edge,/OPENAIP_API_KEY/);
 assert.doesNotMatch(edge,/sb_secret_[A-Za-z0-9_-]{10}/);
 assert.match(edge,/referenceOnly: true/);
});
test('Las geometrías se tratan como referencia y sin HTML no confiable',()=>{
 assert.match(layerJS,/L\.geoJSON\(/);
 assert.match(layerJS,/document\.createElement\('section'\)/);
 assert.match(layerJS,/textContent=/);
 assert.doesNotMatch(layerJS,/innerHTML\s*=/);
 assert.match(layerJS,/CC BY-NC 4\.0/);
 assert.match(layerJS,/LIMIT_PAGES=8/);
});


test('Los espacios aéreos mantienen categorías y estilos diferenciables',()=>{
 const types={CTR:4,TMA:7,CTA:26,ATZ:13,R:1,D:2,P:3,OTHER:999};
 for(const [category,type] of Object.entries(types))
  assert.equal(api.airspaceCategory(type),category);
 const colors=Object.keys(types).map(category=>api.sectorStyle(category).color);
 assert.equal(new Set(colors).size,colors.length);
 assert.match(api.sectorStyle('R').dashArray,/\d/);
 assert.match(api.sectorStyle('D').dashArray,/\d/);
 assert.equal(api.sectorStyle('P').dashArray,null);
 assert.ok(api.sectorStyle('CTR',true).weight>api.sectorStyle('CTR').weight);
 assert.ok(api.sectorStyle('CTR',false,true).fillOpacity<api.sectorStyle('CTR').fillOpacity);
});

test('Filtros por función, etiquetas y resaltado están aislados en OpenAIP',()=>{
 assert.match(layerJS,/filterPanel\.id='openaip-airspace-filters'/);
 assert.match(layerJS,/checkbox\.addEventListener\('change'/);
 assert.match(layerJS,/enabledCategories\.has\(item\.category\)/);
 assert.match(layerJS,/focusSector\(item\)/);
 assert.match(layerJS,/renderLabels\(\)/);
 assert.match(layerJS,/map\.on\('zoomend',renderLabels\)/);
 assert.match(layerJS,/document\.createElement\('span'\)/);
 assert.match(layerJS,/filterPanel\.hidden=kind!=='airspaces'/);
 assert.match(layerJS,/status\.after\(filterPanel\)/);
 assert.match(html,/openaip-sector-name/);
 assert.match(html,/20261106sectores1/);
});
