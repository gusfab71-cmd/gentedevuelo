'use strict';
// Pruebas de contrato offline: no sustituyen concurrencia con JWT ni restauración.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const sql=fs.readFileSync(path.join(__dirname,'../docs/aerosuite-fix-serializacion-cobros-2026-11-08.sql'),'utf8');
const clean=sql.replace(/^--.*$/gm,'');
test('Firma y seguridad del RPC heredado permanecen intactas',()=>{
 assert.match(clean,/CREATE OR REPLACE FUNCTION public\.aerosuite_finance_action\(p_institution_id uuid, p_operation text/i);
 assert.match(clean,/SECURITY DEFINER\s+SET search_path TO ''/i);
 assert.match(clean,/v_actor uuid:=auth\.uid\(\)/i);
 assert.match(clean,/m\.role in \('administrador','secretaria'\)/i);
 assert.match(clean,/v_mode not in \('trial','grace','active'\)/i);
});
test('Todos los caminos de liquidación adquieren FOR UPDATE del vuelo primero',()=>{
 const lc=clean.toLowerCase();
 const pivot=lc.indexOf("if p_operation in ('pack_use','hour_payment') then");
 const branch=lc.indexOf("if p_operation='pack_sale' then");
 assert.ok(pivot>=0 && branch>pivot,'el bloqueo precede al primer asiento o pack');
 const snippet=clean.slice(pivot,branch);
 assert.match(snippet,/SELECT \* INTO v_booking FROM public\.aerosuite_flight_bookings b[\s\S]*?WHERE b\.id=p_booking_id AND b\.institution_id=p_institution_id FOR UPDATE/i);
 assert.match(snippet,/IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/);
 assert.match(clean,/select \* into v_pack from public\.aerosuite_hour_packs where id=p_pack_id and institution_id=p_institution_id for update/i);
 assert.doesNotMatch(clean,/select \* into v_booking from public\.aerosuite_flight_bookings where id=p_booking_id and institution_id=p_institution_id;/i);
});
test('Conserva validaciones de deuda, aprobación de vuelo y exclusión de doble cobro',()=>{
 assert.match(clean,/aerosuite_student_debts/);
 assert.match(clean,/v_booking\.status<>'completed'/);
 assert.match(clean,/r\.status='approved'/);
 assert.match(clean,/aerosuite_pack_usages/);
 assert.match(clean,/aerosuite_money_movements/);
 assert.match(clean,/if v_used\+p_minutes>v_pack\.total_minutes/i);
});
test('No ejecuta cambios masivos ni destruye historial de operación',()=>{
 assert.doesNotMatch(clean,/\b(?:truncate|drop\s+table|delete\s+from|alter\s+table)\b/i);
 assert.doesNotMatch(clean,/\b(?:update|delete\s+from)\s+(?:public\.)?aerosuite_flight_bookings\b/i);
});
