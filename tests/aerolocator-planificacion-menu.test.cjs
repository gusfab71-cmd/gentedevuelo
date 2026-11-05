// AeroLocator: el único acceso al planificador es el selector de vistas.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'utilidades/pistas-no-oficiales.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/aerolocator-route-planner.css'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/aerolocator-route-planner.js'),'utf8');

test('Selector indica que planifica ruta VFR e incorpora PRONAREA',()=>{
 assert.match(html,/<option value="pronarea">PRONAREA · Planificador de vuelo VFR<\/option>/);
 assert.doesNotMatch(html,/>Planificador VFR · Ruta y PRONAREA</);
 assert.match(html,/<h3>PRONAREA · Planificador de vuelo VFR<\/h3>/);
});
test('La franja duplicada no aparece sobre el mapa',()=>{
 assert.doesNotMatch(html,/Planificador de ruta VFR/);
 assert.match(css,/#route-planner-panel>summary\{display:none!important\}/);
 assert.match(css,/#route-planner-panel\{display:none!important\}/);
});
test('El selector activa los controles en modo pronarea',()=>{
 assert.match(html,/classList\.toggle\('vfr-planning-selected',planningMode\)/);
 assert.match(html,/\.open=false;/);
 assert.match(css,/\.vfr-planning-selected #route-planner-panel\[open\]/);
});
test('Se conserva acceso para pausar trazado o revisar ruta terminada',()=>{
 assert.match(js,/toggle\.dataset\.routeState=/);
 assert.match(js,/Pausar trazado VFR/);
 assert.match(css,/#route-planner-toggle\{\s*display:inline-flex!important/);
 assert.match(html,/id="route-start"/);
 assert.match(html,/id="route-view-map-panel"/);
});

test('Seleccionar PRONAREA no despliega la franja de ruta ni tapa el mapa',()=>{
 assert.match(html,/document\.getElementById\('route-planner-panel'\)\.open=false;/);
 assert.match(html,/contextualInspector\(next!=='airfields'\)/);
 assert.match(html,/pronareaEditor\.hidden=!\(open&&mode==='pronarea'\)/);
 assert.match(css,/#route-planner-panel\{display:none!important\}/);
});
