'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261108062916_aerosuite_in_app_notifications_private_inbox_20261108.sql'),'utf8');
const page=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/avisos-institucionales.html'),'utf8');
const portal=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/portal-escuela.html'),'utf8');
test('Avisos internos sin envío de correo ni WhatsApp y con RLS cerrado',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.aerosuite_notification_inbox/);
 assert.match(sql,/ALTER TABLE public\.aerosuite_notification_inbox ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.aerosuite_notification_inbox FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/recipient_id uuid NOT NULL REFERENCES auth\.users/);
 assert.match(sql,/UNIQUE\(institution_id,event_id,recipient_id\)/);
 assert.doesNotMatch(sql,/net\.http_post|resend\.com|graph\.facebook\.com/);
 assert.match(page,/No se envían automáticamente por correo ni WhatsApp/);
});
test('Los eventos siguen reservas y estados de informes sin duplicar actualizaciones idénticas',()=>{
 for(const event of ['booking_pending','booking_confirmed','booking_cancelled','booking_rescheduled',
     'report_submitted','report_returned','report_approved'])assert.ok(sql.includes(event),event);
 assert.match(sql,/NEW\.status IS DISTINCT FROM OLD\.status/);
 assert.match(sql,/NEW\.starts_at IS DISTINCT FROM OLD\.starts_at/);
 assert.match(sql,/AFTER INSERT OR UPDATE OF status,starts_at,instructor_id,aircraft/);
 assert.match(sql,/AFTER INSERT OR UPDATE OF status ON public\.aerosuite_flight_reports/);
 assert.match(sql,/EXCEPTION WHEN OTHERS THEN/);
});
test('El destinatario tiene que ser miembro de la escuela y ser rol permitido',()=>{
 assert.match(sql,/m\.institution_id=p_institution_id/);
 assert.match(sql,/m\.user_id=p_student_id AND m\.role IN \('alumno','piloto'\)/);
 assert.match(sql,/m\.user_id=p_instructor_id AND m\.role='instructor'/);
 assert.match(sql,/m\.role IN \('administrador','secretaria'\)/);
 assert.match(sql,/n\.recipient_id=v_actor/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/private\.aerosuite_access_mode/);
 assert.match(sql,/n\.id=ANY\(v_ids\) AND n\.read_at IS NULL/);
 assert.match(sql,/IN \('trial','active'\)/);
 assert.match(page,/!n\.read_at&&school\.can_write/);
});
test('RPC no accesibles a anon y marcado de lectura limitado',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_notification_inbox_list\(uuid,integer\) FROM PUBLIC,anon/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_notification_mark_read\(uuid,uuid\[\]\) FROM PUBLIC,anon/);
 assert.match(sql,/cardinality\(v_ids\)>100/);
 assert.match(sql,/LIMIT least\(greatest\(coalesce\(p_limit,30\),1\),100\)/);
});
test('Pantalla institucional sintácticamente válida y disponible a cinco roles',()=>{
 const scripts=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
     .map(x=>x[1].trim()).filter(Boolean);
 assert.ok(scripts.length);
 scripts.forEach(js=>assert.doesNotThrow(()=>new vm.Script(js)));
 assert.match(page,/aerosuite_my_institution_access_v2/);
 assert.match(page,/aerosuite_notification_inbox_list/);
 assert.match(page,/aerosuite_notification_mark_read/);
 assert.match(page,/storageKey:labLogin/);
 assert.match(portal,/id="aerosuiteInboxLink" data-visible-role="administrador secretaria instructor alumno piloto"/);
 assert.match(portal,/avisos-institucionales\.html\?institucion=/);
});
