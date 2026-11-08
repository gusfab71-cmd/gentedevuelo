// Verifica una PROPUESTA de hardening, no el estado desplegado de Supabase.
// Sin red, sin credenciales, sin escrituras y sin suplantación de JWT.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(
 path.resolve(__dirname,'../docs/aerosuite-propuesta-reserva-sin-instructor-2026-11-08.sql'),'utf8');
const sql=source.replace(/^--.*$/gm,'');
const role=new Set(['administrador','secretaria','alumno','piloto']);
const effectiveSubject=(actorRole,actorId,requestedId)=>
 ['administrador','secretaria'].includes(actorRole)?requestedId:actorId;
const canRequestWithoutInstructor=(actorRole,actorId,requestedId,verifiedId)=>
 role.has(actorRole) && ['administrador','secretaria','piloto'].includes(actorRole) &&
 effectiveSubject(actorRole,actorId,requestedId)===verifiedId;

test('Contrato SQL: conserva la función pública, SECURITY DEFINER y search_path seguro',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_reserve_with_instructor\(/i);
 assert.match(sql,/SECURITY DEFINER/i);
 assert.match(sql,/SET search_path TO ''/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_reserve_with_instructor\(uuid,uuid,uuid,boolean\) FROM PUBLIC, anon/i);
});
test('La licencia se verifica sobre el mismo titular efectivo que se reserva',()=>{
 assert.match(sql,/select m\.role into v_role from public\.aerosuite_institution_members m/i);
 assert.match(sql,/v_subject\s*:=\s*case when v_role in\('administrador','secretaria'\) then p_student_id else v_actor end/i);
 assert.match(sql,/pa\.user_id=v_subject and pa\.status='verified'/i);
 assert.doesNotMatch(sql,/pa\.user_id\s*=\s*coalesce\(p_student_id\s*,\s*v_actor\)/i);
 assert.match(sql,/v_result:=public\.aerosuite_availability_reserve\(p_institution_id,p_slot_id,p_student_id\)/i);
});
test('Rol Alumno no puede pedir vuelo sin instructor usando el UUID de un piloto validado',()=>{
 assert.equal(canRequestWithoutInstructor('alumno','ALUMNO','PILOTO_VERIFICADO','PILOTO_VERIFICADO'),false);
 assert.match(sql,/if v_role not in \('administrador','secretaria','piloto'\)/i);
});
test('Piloto usa su propia habilitación, nunca la habilitación indicada en la URL o parámetro',()=>{
 assert.equal(canRequestWithoutInstructor('piloto','PILOTO_PROPIO','PILOTO_AJENO','PILOTO_AJENO'),false);
 assert.equal(canRequestWithoutInstructor('piloto','PILOTO_PROPIO',null,'PILOTO_PROPIO'),true);
});
test('Dirección y Secretaría solo pueden pedir por un piloto autorizado de la escuela',()=>{
 for(const r of ['administrador','secretaria']){
  assert.equal(canRequestWithoutInstructor(r,'GESTOR','PILOTO_VERIFICADO','PILOTO_VERIFICADO'),true);
  assert.equal(canRequestWithoutInstructor(r,'GESTOR','PILOTO_NO_VERIFICADO','PILOTO_VERIFICADO'),false);
  assert.equal(canRequestWithoutInstructor(r,'GESTOR',null,'PILOTO_VERIFICADO'),false);
 }
});
test('La propuesta no habilita roles desconocidos ni invocaciones anónimas',()=>{
 assert.equal(canRequestWithoutInstructor('instructor','INST','PILOTO','PILOTO'),false);
 assert.equal(canRequestWithoutInstructor('',null,'PILOTO','PILOTO'),false);
 assert.match(sql,/if v_actor is null or p_with_instructor is null/i);
});
