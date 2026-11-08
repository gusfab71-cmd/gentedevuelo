// Pruebas de contrato del frontend institucional. No son pruebas E2E con JWT.
// Solo inspeccionan archivos locales: sin red, credenciales, datos ni escrituras.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=name=>fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica',name),'utf8');
const login=html('ingreso-escuela.html');
const portal=html('portal-escuela.html');
const lab=html('centro-pruebas-operativas.html');
const fleet=html('flota-institucional.html');
const roles=['administrador','secretaria','instructor','alumno','piloto'];
const links=[...portal.matchAll(/<a\b[^>]*data-visible-role="([^"]+)"[^>]*>/g)]
 .map(m=>({roles:m[1].split(/\s+/),module:(m[0].match(/data-module="([^"]+)"/)||[])[1],id:(m[0].match(/id="([^"]+)"/)||[])[1]}));
const allowed=(mod,role)=>links.some(x=>x.module===mod&&x.roles.includes(role));
test('Centro permanente: exactamente cinco roles técnicos diferenciados',()=>{
 assert.match(lab,/const roles=\['administrador','secretaria','instructor','alumno','piloto'\]/);
 for(const role of roles){
  assert.match(lab,new RegExp('id="create'+role[0].toUpperCase()+role.slice(1)+'"'));
  assert.match(lab,new RegExp("encodeURIComponent\\(role\\)"));
 }
 assert.match(lab,/id="content" hidden/);
});
test('La prueba usa sesiones distintas de la institucional normal y separadas por rol',()=>{
 for(const source of [login,portal]){
  assert.match(source,/aerosuite-laboratorio-/);
  assert.match(source,/aerosuite-institucional-v2-auth/);
  assert.match(source,/prueba/);
  assert.match(source,/\['administrador','secretaria','instructor','alumno','piloto'\]/);
 }
});
test('La URL de rol no autoriza por sí sola: usuario, pertenencia y licencia son obligatorios',()=>{
 assert.match(portal,/client\.auth\.getUser\(\)/);
 assert.match(portal,/client\.rpc\('aerosuite_my_institution_access_v2'\)/);
 assert.match(portal,/data\.find\(x=>x\.institution_id===queryId&&\(!requestedRole\|\|x\.my_role===requestedRole\)\)/);
 assert.match(portal,/if\(!school\.can_access\)/);
});
test('La Academia no se ofrece a Secretaría ni Piloto, y sí a docentes y alumnos',()=>{
 for(const role of ['administrador','instructor','alumno'])assert.ok(allowed('recursos',role),role);
 for(const role of ['secretaria','piloto'])assert.equal(allowed('recursos',role),false,role);
});
test('Contaduría y cobros solo están visibles para Dirección y Secretaría',()=>{
 for(const mod of ['contaduria','cobros']){
  for(const role of roles)assert.equal(allowed(mod,role),['administrador','secretaria'].includes(role),mod+' '+role);
 }
});
test('La consulta personal de horas no equivale a permiso de Contaduría',()=>{
 for(const role of ['alumno','piloto']){
  assert.ok(allowed('finanzas',role));
  assert.equal(allowed('contaduria',role),false);
 }
});
test('AeroMeteo se ofrece a los cinco roles y no concede por sí mismo permisos económicos',()=>{
 const weather=links.find(x=>x.id==='aerosuiteAeroMeteoLink');
 assert.ok(weather);
 for(const role of roles)assert.ok(weather.roles.includes(role),role);
 assert.equal(weather.module,undefined);
});
test('Flota comprueba autenticación y pertenencia en destino, no solo visibilidad',()=>{
 assert.match(fleet,/db\.auth\.getUser\(\)/);
 assert.match(fleet,/db\.rpc\("aerosuite_my_institution_access_v2"\)/);
 assert.match(fleet,/x\.institution_id===inst&&x\.can_access&&\["administrador","secretaria","instructor"\]\.includes\(x\.my_role\)/);
 assert.match(fleet,/\["administrador","secretaria"\]\.includes\(school\.my_role\)/);
});
