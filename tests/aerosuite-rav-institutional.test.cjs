'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261108052751_aerosuite_rav_institutional_drafts_review_no_certification_20261108.sql'),'utf8');
const page=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/rav-institucional.html'),'utf8');
const portal=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/portal-escuela.html'),'utf8');

test('RAV persiste solo datos institucionales con RLS y sin acceso directo a tablas',()=>{
 for(const table of ['aerosuite_rav_documents','aerosuite_rav_flights','aerosuite_rav_audit']){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
 }
 assert.match(sql,/REVOKE ALL ON public\.aerosuite_rav_documents,public\.aerosuite_rav_flights,public\.aerosuite_rav_audit FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/FOREIGN KEY\(institution_id,rav_id\)/);
 assert.match(sql,/CONSTRAINT rav_report_once UNIQUE\(institution_id,report_id\)/);
});
test('RAV usa datos de vuelo reales aprobados, de un solo alumno e institución',()=>{
 assert.match(sql,/r\.status AS report_status/);
 assert.match(sql,/v_r\.report_status<>'approved'/);
 assert.match(sql,/v_r\.booking_status<>'completed'/);
 assert.match(sql,/v_r\.instructor_id IS DISTINCT FROM v_r\.booking_instructor/);
 assert.match(sql,/b\.student_id=v_doc\.student_id/);
 assert.match(sql,/v_r\.logbook_entry->>'flight_role'/);
 assert.match(sql,/c\.book_minutes<>v_r\.flight_minutes/);
 assert.match(sql,/aerosuite_rav_flights\(institution_id,rav_id,report_id/);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.aerosuite_flight_(?:bookings|reports)\b/i);
});
test('Estados RAV, control optimista, trazabilidad y no certificación',()=>{
 assert.match(sql,/IN \('draft','submitted','returned','reviewed'\)/);
 assert.match(sql,/p_expected_revision IS DISTINCT FROM v_doc\.revision/);
 assert.match(sql,/p_action='review' AND EXISTS\(/);
 assert.match(sql,/r\.logbook_entry IS DISTINCT FROM f\.flight_snapshot->'logbook_entry'/);
 assert.match(sql,/v_role<>'administrador' OR v_doc\.status<>'submitted'/);
 assert.match(sql,/INSERT INTO public\.aerosuite_rav_audit/);
 assert.match(sql,/'certified',false/);
 assert.match(sql,/no se permite certificar ni firmar/);
});
test('Autorización: las RPC solo son ejecutables por sesiones institucionales',()=>{
 assert.match(sql,/v_actor uuid:=auth\.uid\(\)/);
 assert.match(sql,/m\.role IN \('administrador','secretaria'\)/);
 assert.match(sql,/v_mode NOT IN \('trial','active','grace'\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_rav_manage.* FROM PUBLIC,anon/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_rav_overview\(uuid\) FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.aerosuite_rav_overview\(uuid\) TO authenticated/);
});
test('La pantalla institucional es sintácticamente válida, conectada y señala NO CERTIFICADO',()=>{
 const scripts=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1].trim()).filter(Boolean);
 assert.ok(scripts.length>0);
 scripts.forEach(source=>new vm.Script(source));
 assert.match(page,/aerosuite_rav_manage/);
 assert.match(page,/aerosuite_rav_overview/);
 assert.match(page,/aerosuite_my_institution_access_v2/);
 assert.match(page,/supabase-2\.117\.2/);
 assert.match(page,/NO CERTIFICADO/);
 assert.match(page,/Sin firma|SIN firma|no firma/i);
 assert.match(page,/p_expected_revision:doc\.revision/);
 assert.match(page,/p_report_ids:reportIds/);
 assert.match(portal,/id="ravInstitutionLink" data-visible-role="administrador secretaria"/);
 assert.match(portal,/rav-institucional\.html\?institucion=/);
});
