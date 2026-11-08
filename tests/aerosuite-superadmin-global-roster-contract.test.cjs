// Comprueba la consistencia entre Padrón Global y propuesta SQL. No ejecuta bajas.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/superadministrador.html'),'utf8');
const proposal=fs.readFileSync(path.join(root,'docs/aerosuite-propuesta-baja-pilotos-padron-global-2026-11-08.sql'),'utf8');

test('Padrón Global: permite filtrar y mostrar Piloto',()=>{
 assert.match(panel,/<option value="piloto">Piloto<\/option>/);
 assert.match(panel,/personRole=\{[^\n]*piloto:'Piloto'/);
});
test('Panel: el borrado actual es de invitación o vinculación, no borrado de Auth',()=>{
 assert.match(panel,/button\.textContent=canUnlink\?'Desvincular acceso':'Cancelar invitación'/);
 assert.match(panel,/db\.rpc\('aerosuite_superadmin_manage_registration'/);
 assert.doesNotMatch(panel,/auth\.admin\.deleteUser\(/);
});
test('Propuesta RPC: solo superadministración, incluye todos los roles',()=>{
 assert.match(proposal,/CREATE OR REPLACE FUNCTION public\.aerosuite_superadmin_manage_registration/i);
 assert.match(proposal,/exists\(select 1 from public\.aerosuite_superadmins s where s\.user_id=v_actor\)/i);
 assert.match(proposal,/p_role not in \('administrador','secretaria','instructor','alumno','piloto','operaciones','tesoreria'\)/);
 assert.match(proposal,/p_kind not in \('integrante','invitacion'\)/);
 assert.match(proposal,/REVOKE ALL ON FUNCTION public\.aerosuite_superadmin_manage_registration\(uuid,uuid,text,text\) FROM PUBLIC, anon/i);
});
test('Nunca permite desvincular al propio Superadministrador desde el Padrón',()=>{
 assert.match(proposal,/if p_person_id=v_actor then/i);
 assert.match(proposal,/No podés desvincular tu propio acceso desde este panel/i);
});
