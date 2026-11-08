'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const {test}=require('node:test');
const file=path.resolve(__dirname,'../supabase/migrations/20261108054213_aerosuite_pilot_cma_expiry_and_reverification_guard_20261108.sql');
const sql=fs.readFileSync(file,'utf8');
test('CMA vigente para día del vuelo sin instructor y no se inventa vencimiento de licencia',()=>{
 assert.match(sql,/medical_expires_on\s*>=\s*p_flight_date/);
 assert.match(sql,/pc\.license_expires_on IS NULL OR pc\.license_expires_on>=p_flight_date/);
 assert.match(sql,/pc\.ratings_expires_on IS NULL OR pc\.ratings_expires_on>=p_flight_date/);
 assert.match(sql,/medical_certificate_type/);
});
test('Verificación institucional, reserva y confirmación vuelven a comprobar documentación',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_pilot_verify/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_reserve_with_instructor/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_confirm_without_instructor/);
 assert.match(sql,/aerosuite_pilot_documents_valid\(\s*p_user_id/);
 assert.match(sql,/aerosuite_pilot_documents_valid\(\s*v_pilot/);
 assert.match(sql,/aerosuite_pilot_documents_valid\(\s*v_booking\.student_id/);
 assert.match(sql,/v_pilot:=CASE WHEN v_role IN \('administrador','secretaria'\) THEN p_student_id ELSE v_actor END/);
});
test('Editar certificados revoca autorización anterior',()=>{
 assert.match(sql,/CREATE TRIGGER aerosuite_pilot_credentials_change_reverify/);
 assert.match(sql,/AFTER UPDATE OF medical_certificate_type,medical_expires_on,license_expires_on,ratings_declared,ratings_expires_on/);
 assert.match(sql,/SET status='revoked',updated_at=now\(\)/);
 assert.match(sql,/WHERE user_id=OLD\.user_id AND status='verified'/);
});
test('No expone el verificador técnico al cliente',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION aerosuite_internal\.aerosuite_pilot_documents_valid\(uuid,date\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION aerosuite_internal\.aerosuite_revoke_pilot_on_document_change\(\) FROM PUBLIC,anon,authenticated/);
});
