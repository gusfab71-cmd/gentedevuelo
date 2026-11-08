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
const agenda=read("utilidades/gestion-aeronautica/aerosuite-agenda-publicada.js");

assert.match(standalone,/gdv_aircraft_maintenance/,"La app privada original sigue intacta");
assert.doesNotMatch(institutional,/gdv_aircraft_maintenance|GDV_AUTH/,"No mezclar datos privados");
assert.match(institutional,/aerosuite_institution_maintenance_get/);
assert.match(institutional,/aerosuite_institution_maintenance_save/);
assert.match(institutional,/p_expected_revision:maintRevision/,"Control de concurrencia");
assert.match(institutional,/aerosuite_aircraft_list/,"Matrículas institucionales");
assert.match(institutional,/function reconcileFleet/);
assert.match(institutional,/async function delAc\(id\)\{[\s\S]*?if\(!maintWritable\|\|maintConflict\)return alert\('Sin permiso de escritura\.'\)/,"Restringir baja por disponibilidad y conservar trazabilidad");
assert.match(institutional,/async function addAc\(\)\{[\s\S]*?if\(!maintWritable\|\|maintConflict\|\|!db\)return alert\('Solo Dirección o Secretaría pueden registrar aeronaves\.'\)/,"Alta institucional protegida por permisos");
assert.match(institutional,/testRole\+"-v1-auth"/,"Centro de Testeo por rol");
assert.match(institutional,/src="\.\.\/\.\.\/assets\/maintenance-consumables\.js/);
assert.match(institutional,/const TABS=.*Inspecciones.*Novedades.*Componentes.*Controles.*Bitácora/);

assert.match(fleet,/id="maintenanceLink"/);
assert.match(fleet,/mantenimiento-institucional\.html/);
assert.match(fleet,/aerosuite_institution_maintenance_get/);
assert.match(fleet,/Mantenimiento de Aeronaves/);
assert.match(fleet,/aerosuite_maintenance_alerts/,"El listado de flota consulta avisos por matrícula");
assert.match(fleet,/maintenanceAlertMap/,"Las alertas se vinculan a la matrícula de Flota");
assert.match(fleet,/MANTENIMIENTO · REVISAR VENCIMIENTO/,"Vencimientos visibles");
assert.match(fleet,/MANTENIMIENTO · DATOS PENDIENTES/,"Datos incompletos visibles");
assert.match(fleet,/MANTENIMIENTO · SIN CONSULTA DE ALERTAS/,"Falla de red no se convierte en estado correcto");
assert.match(fleet,/a\.availability==="available"/,"El estado operativo de Flota permanece independiente");
assert.match(fleet,/\&matricula=/,"Acceso directo a la ficha técnica");
assert.match(institutional,/requestedAircraftRegistration=AeroSuiteRegistration\.normalize/);
assert.match(institutional,/requestedAircraft=S\.ac\.find\(a=>!a\.archived/);
assert.match(agenda,/aerosuite_maintenance_alerts/,"La Turnera sigue consultando avisos técnicos");
assert.match(agenda,/const due=warnings\.filter\(w=>w\.level==="due"\)/,"Detectar vencimientos antes de publicar");
assert.match(agenda,/if\(due\.length\)\{[\s\S]*?return false;/,"Bloqueo visual sin opción de continuar con límite vencido");


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
