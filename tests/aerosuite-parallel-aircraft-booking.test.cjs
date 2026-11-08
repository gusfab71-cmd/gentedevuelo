'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261108065000_aerosuite_parallel_aircraft_booking_guard.sql'),'utf8');
test('Elimina la exclusividad institucional por fecha y limita la unicidad a la aeronave',()=>{
 assert.match(sql,/DROP INDEX IF EXISTS public\.aerosuite_flight_booking_slot_unique/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS aerosuite_flight_booking_aircraft_start_unique/);
 assert.match(sql,/upper\(btrim\(aircraft\)\),starts_at/);
});
test('Previene el mismo alumno o piloto en turnos de 90 minutos superpuestos',()=>{
 assert.match(sql,/b\.student_id=NEW\.student_id/);
 assert.match(sql,/tstzrange\(b\.starts_at,b\.starts_at\+interval '90 minutes','\[\)'\)/);
 assert.match(sql,/tstzrange\(NEW\.starts_at,NEW\.starts_at\+interval '90 minutes','\[\)'\)/);
});
test('Previene aeronave o instructor en dos vuelos superpuestos',()=>{
 assert.match(sql,/upper\(btrim\(b\.aircraft\)\)=upper\(btrim\(NEW\.aircraft\)\)/);
 assert.match(sql,/b\.instructor_id=NEW\.instructor_id/);
 assert.match(sql,/b\.status='confirmed'/);
});
test('Serializa escrituras concurrentes por institución, sin tocar vuelos o turnos existentes',()=>{
 assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(NEW\.institution_id::text,0\)\)/);
 assert.match(sql,/BEFORE INSERT OR UPDATE OF institution_id,student_id,starts_at,aircraft,status,instructor_id/);
 assert.match(sql,/SECURITY DEFINER SET search_path TO ''/);
 assert.doesNotMatch(sql,/DELETE FROM public\.aerosuite_flight_bookings|TRUNCATE/i);
});
