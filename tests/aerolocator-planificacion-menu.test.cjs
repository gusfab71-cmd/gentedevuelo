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
 assert.match(html,/<option value="pronarea">Planificador VFR · Ruta y PRONAREA<\/option>/);
 assert.doesNotMatch(html,/>PRONAREA · Planificador de vuelo VFR</);
 assert.match(html,/<h3>PRONAREA · Meteorología de la ruta<\/h3>/);
});
test('La franja duplicada no aparece sobre el mapa',()=>{
 assert.doesNotMatch(html,/Planificador de ruta VFR/);
 assert.match(css,/#route-planner-panel>summary\{display:none!important\}/);
 assert.match(css,/#route-planner-panel\{display:none!important\}/);
});
test('El selector activa los controles en modo pronarea',()=>{
 assert.match(html,/classList\.toggle\('vfr-planning-selected',planningMode\)/);
 assert.match(html,/\.open=planningMode&&!routePlanner\?\.isDrawing\(\)/);
 assert.match(css,/\.vfr-planning-selected #route-planner-panel\[open\]/);
});
test('Se conserva acceso para pausar trazado o revisar ruta terminada',()=>{
 assert.match(js,/toggle\.dataset\.routeState=/);
 assert.match(js,/Pausar trazado VFR/);
 assert.match(css,/#route-planner-toggle\[data-route-state="drawing"\]/);
 assert.match(css,/#route-planner-toggle\[data-route-state="finished"\]/);
 assert.match(html,/id="route-start"/);
 assert.match(html,/id="route-view-map-panel"/);
});
