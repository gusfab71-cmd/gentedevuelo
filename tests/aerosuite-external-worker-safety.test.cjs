'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const ts=fs.readFileSync(path.join(root,'supabase/functions/aerosuite-external-email-worker/index.ts'),'utf8');
test('Worker no expone envío sin secreto ni habilitación explícita',()=>{
 assert.match(ts,/AEROSUITE_EXTERNAL_WORKER_SECRET/);
 assert.match(ts,/key\.length<48/);
 assert.match(ts,/AEROSUITE_EXTERNAL_SEND_ENABLED/);
 assert.match(ts,/input\.mode!=="send"/);
 assert.match(ts,/No autorizado/);
 assert.match(ts,/Envíos deshabilitados/);
 assert.doesNotMatch(ts,/Deno\.cron|setInterval|schedule\(/);
});
test('Sólo cuenta de servicio accede a cola privada, no se envían datos a otros canales',()=>{
 assert.match(ts,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(ts,/createClient\(url,role/);
 assert.match(ts,/aerosuite_external_email_outbox/);
 assert.match(ts,/aerosuite_external_delivery_preferences/);
 assert.match(ts,/aerosuite_external_delivery_settings/);
 assert.match(ts,/aerosuite_institution_members/);
 assert.match(ts,/aerosuite_notification_inbox/);
 assert.doesNotMatch(ts,/graph\.facebook\.com|whatsapp/i);
});
test('Antes del envío se cotejan escuela real, consentimiento y correo confirmado',()=>{
 assert.match(ts,/settings\.data\?\.email_enabled===true/);
 assert.match(ts,/pref\.data\?\.email_opt_in===true/);
 assert.match(ts,/school\.data\?\.is_test===false/);
 assert.match(ts,/user\?\.email_confirmed_at/);
 assert.match(ts,/Boolean\(member\.data\?\.length\)/);
});
test('Entrega idempotente con estados recuperables sin reintentos ciegos',()=>{
 assert.match(ts,/Idempotency-Key/);
 assert.match(ts,/item\.id/);
 assert.match(ts,/eq\("state","pending"\)/);
 assert.match(ts,/state:"claimed"/);
 assert.match(ts,/manual_review/);
 assert.doesNotMatch(ts,/while\s*\(true\)|setTimeout\(/);
});
