// AeroLocator · regresión visual no destructiva (Flight Operations).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'utilidades/pistas-no-oficiales.html'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/aerolocator-flight-operations-theme.css'),'utf8');
const logo=fs.readFileSync(path.join(base,'assets/aerolocator-brand.svg'),'utf8');
test('AeroLocator muestra marca primero y Developed by Gente de Vuelo debajo',()=>{
 assert.match(html,/<a class="dispatch-nav-logo"[^>]*aria-label="AeroLocator · Developed by Gente de Vuelo"/);
 assert.match(html,/<img class="aerolocator-brand-icon"[^>]*aerolocator-brand\.svg"/);
 assert.match(html,/<strong class="aerolocator-brand-name">Aero<span>Locator<\/span><\/strong>/);
 assert.match(html,/<small class="aerolocator-brand-credit">Developed by Gente de Vuelo<\/small>/);
 assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\.\.\/assets\/aerolocator-brand\.svg">/);
});
test('Paleta visual de Flight Operations y tema cargado al final',()=>{
 assert.match(html,/<\/style><link rel="stylesheet" href="\.\.\/assets\/aerolocator-flight-operations-theme\.css/);
 for(const value of ['#101719','#1a2426','#202d30','#ff994b','#ffca94'])assert.ok(css.includes(value));
 assert.match(css,/\.dispatch-sidebar-heading:after/);
 assert.match(css,/\.dispatch-nav-logo \.aerolocator-brand-name/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/prefers-reduced-motion/);
});
test('Logo distintivo vectorial sin dependencias externas',()=>{
 assert.match(logo,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
 assert.match(logo,/<title id="title">AeroLocator<\/title>/);
 assert.match(logo,/<desc id="desc">/);
 assert.match(logo,/fill="url\(#aero\)"/);
 assert.match(logo,/fill="url\(#trail\)"/);
 assert.doesNotMatch(logo,/<script\b|<foreignObject\b|onload\s*=/i);
});
test('El nuevo tema no cambia el mapa ni oculta sus herramientas',()=>{
 for(const id of ['dispatch-layout','dispatch-sidebar','control-toggle','map','map-view-mode',
   'map-fullscreen','route-planner-panel','route-planner-toggle','pronarea-visual','navaid-controls',
   'openaip-overview','basemap-selector','map-inspector-toggle']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 for(const value of ['airfields','ourairports','navaids','openaip-airspaces','openaip-points','sigmet','pronarea'])
  assert.match(html,new RegExp('<option value="'+value+'">'));
 assert.doesNotMatch(css,/\.leaflet-(?:marker|tile|popup|control-zoom)\b/);
 assert.match(html,/client=supabase\.createClient\(GDV_CONFIG\.url,GDV_CONFIG\.key\)/);
});
