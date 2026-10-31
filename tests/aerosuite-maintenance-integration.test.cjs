"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const read=relative=>fs.readFileSync(path.join(__dirname,"..",relative),"utf8");
const standalone=read("utilidades/mantenimiento-aeronaves.html");
const institutional=read("utilidades/gestion-aeronautica/mantenimiento-institucional.html");
const fleet=read("utilidades/gestion-aeronautica/flota-institucional.html");
const director=read("utilidades/gestion-aeronautica/cierre-diario-director.html");

assert.match(standalone,/gdv_aircraft_maintenance/,"La app privada original sigue intacta");
assert.doesNotMatch(institutional,/gdv_aircraft_maintenance|GDV_AUTH/,"No mezclar datos privados");
assert.match(institutional,/aerosuite_institution_maintenance_get/);
assert.match(institutional,/aerosuite_institution_maintenance_save/);
assert.match(institutional,/p_expected_revision:maintRevision/,"Control de concurrencia");
assert.match(institutional,/aerosuite_aircraft_list/,"Matrículas institucionales");
assert.match(institutional,/function reconcileFleet/);
assert.match(institutional,/function delAc\(id\)\{alert\(/,"Evitar borrar historial técnico");
assert.match(institutional,/function addAc\(\)\{alert\(/,"Alta solo desde Flota");
assert.match(institutional,/testRole\+"-v1-auth"/,"Centro de Testeo por rol");
assert.match(institutional,/src="\.\.\/\.\.\/assets\/maintenance-consumables\.js/);
assert.match(institutional,/const TABS=.*Inspecciones.*Novedades.*Componentes.*Controles.*Bitácora/);

assert.match(fleet,/id="maintenanceLink"/);
assert.match(fleet,/mantenimiento-institucional\.html/);
assert.match(fleet,/aerosuite_institution_maintenance_get/);
assert.match(fleet,/Mantenimiento de Aeronaves/);

assert.match(director,/aerosuite_director_period_summary/);
assert.match(director,/aerosuite_institution_maintenance_get/);
assert.match(director,/renderMaintenance\(maintenance,period\)/);
assert.match(director,/technicalDailyRows/);
assert.match(director,/id="manageMaintenance"/);
assert.match(director,/window\.print\(\)/);

for(const [name,source] of Object.entries({institutional,fleet,director})){
 const js=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(Boolean);
 assert.ok(js.length,name+" debe incluir JavaScript");
 for(const [index,code] of js.entries())new vm.Script(code,{filename:name+"#"+index});
}
console.log("OK: mantenimiento institucional aislado, flota única, reporte de Dirección y JS.");
