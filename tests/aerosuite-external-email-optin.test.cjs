'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261108081500_aerosuite_external_email_optin_queue_disabled.sql'),'utf8');
const html=fs.readFileSync(path.join(root,'utilidades/gestion-aeronautica/avisos-institucionales.html'),'utf8');

test('El envío externo comienza desactivado y no hay llamadas a proveedor',()=>{
 assert.match(sql,/email_enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/email_opt_in boolean NOT NULL DEFAULT false/);
 assert.match(sql,/aerosuite_external_email_outbox/);
 assert.doesNotMatch(sql,/net\.http_post|resend\.com|graph\.facebook\.com|smtp/i);
 assert.match(html,/Servicio de envío externo: DESHABILITADO/);
});
test('Consentimiento revocable y scoped a la escuela y al propio usuario',()=>{
 assert.match(sql,/v_actor uuid:=auth\.uid\(\)/);
 assert.match(sql,/p\.institution_id=p_institution_id AND p\.user_id=v_actor/);
 assert.match(sql,/INSERT INTO public\.aerosuite_external_delivery_preferences/);
 assert.match(sql,/IF NOT p_opt_in THEN/);
 assert.match(sql,/last_error='Consentimiento retirado antes del envío'/);
 assert.match(sql,/v_mode NOT IN \('trial','active'\)/);
});
test('Solo se coloca en cola correo confirmado, consentido, con doble interruptor y escuela real',()=>{
 assert.match(sql,/s\.email_enabled IS TRUE/);
 assert.match(sql,/p\.email_opt_in IS TRUE/);
 assert.match(sql,/i\.is_test IS NOT TRUE/);
 assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
 assert.match(sql,/CONFLICT\(notification_id\) DO NOTHING/);
 assert.match(sql,/UNIQUE\(notification_id\)/);
});
test('Los movimientos de baja institucional invalidan la preferencia y cola pendientes',()=>{
 assert.match(sql,/CREATE TRIGGER aerosuite_external_clear_departed_member/);
 assert.match(sql,/AFTER DELETE ON public\.aerosuite_institution_members/);
 assert.match(sql,/DELETE FROM public\.aerosuite_external_delivery_preferences/);
 assert.match(sql,/state='cancelled'/);
});
test('Ningún cliente tiene permiso de acceder a la cola',()=>{
 for(const t of ['aerosuite_external_delivery_settings','aerosuite_external_delivery_preferences','aerosuite_external_email_outbox']){
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+t+' ENABLE ROW LEVEL SECURITY'));
 }
 assert.match(sql,/REVOKE ALL ON public\.aerosuite_external_delivery_settings,public\.aerosuite_external_delivery_preferences,public\.aerosuite_external_email_outbox FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_my_email_preference\(uuid,boolean\) FROM PUBLIC,anon/);
});
test('Preferencias disponibles y pantalla sintácticamente válida',()=>{
 assert.match(html,/aerosuite_my_email_preference/);
 assert.match(html,/p_opt_in:!emailPreference/);
 const js=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1].trim()).filter(Boolean);
 assert.ok(js.length);
 js.forEach(code=>assert.doesNotThrow(()=>new vm.Script(code)));
});
