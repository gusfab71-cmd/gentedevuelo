'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=load('supabase/functions/gdv-superadmin-account-control/index.ts');
const page=load('utilidades/gestion-aeronautica/superadmin-cuentas.html');
const sql=load('docs/gdv-superadmin-control-audit-propuesta-2026-11-08.sql');

test('API solo funciona con sesión verificada y rol real de Superadministrador',()=>{
 assert.match(api,/req\.method!=="POST"/);
 assert.match(api,/origin&&!origins\.has\(origin\)/);
 assert.match(api,/caller\.auth\.getUser\(jwt\)/);
 assert.match(api,/!user\|\|!user\.email_confirmed_at/);
 assert.match(api,/db\.from\("aerosuite_superadmins"\)/);
 assert.match(api,/if\(!permission\.data\)return fail\(403/);
 assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('Protección de cuentas y ausencia de eliminación irreversible en el controlador',()=>{
 for(const table of ['site_admins','aerosuite_superadmins','gdv_special_users'])assert.ok(api.includes('db.from("'+table+'")'));
 assert.match(api,/targetId===user\.id/);
 assert.match(api,/target\.app_metadata\?\.aerosuite_lab===true/);
 assert.match(api,/if\(isProtected\)return fail\(403/);
 assert.doesNotMatch(api,/deleteUser\(|delete\(\)\.eq\(|action==="delete"/);
});
test('Suspensión requiere identidad, motivo, frase y comprobación adicional',()=>{
 assert.match(api,/targetId=String\(body\.target_id\|\|""\)/);
 assert.match(api,/email!==expected\|\|!email/);
 assert.match(api,/reason\.length<8\|\|reason\.length>1000/);
 assert.match(api,/SUSPENDER CUENTA/);
 assert.match(api,/REHABILITAR CUENTA/);
 assert.match(api,/body\.confirmation!==phrase/);
 assert.match(api,/ban_duration:action==="suspend"\?"876000h":"none"/);
 assert.match(api,/recent\.count\|\|0\)>=30/);
});
test('Auditoría obligatoria antes de modificar Auth y desenlace registrado',()=>{
 const insertPos=api.indexOf('db.from("gdv_superadmin_account_control_audit")\n  .insert(');
 const banPos=api.indexOf('db.auth.admin.updateUserById(targetId,');
 const updatePos=api.indexOf('db.from("gdv_superadmin_account_control_audit").update(');
 assert.ok(insertPos>=0&&banPos>insertPos&&updatePos>banPos);
 assert.match(api,/if\(audit\.error\|\|!audit\.data\)/);
 assert.match(api,/outcome=update\.error\?"failed":"success"/);
 assert.match(api,/outcome,finished_at:new Date\(\)\.toISOString\(\)/);
});
test('La tabla de auditoría es privada frente a usuarios normales',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/REVOKE ALL ON TABLE public\.gdv_superadmin_account_control_audit FROM PUBLIC, anon, authenticated/i);
 assert.match(sql,/FOR SELECT TO authenticated/i);
 assert.match(sql,/WHERE s\.user_id = \(SELECT auth\.uid\(\)\)/i);
 assert.match(sql,/GRANT SELECT, INSERT, UPDATE ON TABLE public\.gdv_superadmin_account_control_audit TO service_role/i);
 assert.doesNotMatch(sql,/GRANT INSERT.* TO authenticated/i);
});
test('Interfaz permite inspección, confirmación explícita y no anuncia borrado completo',()=>{
 assert.match(page,/id="accountControlDialog"/);
 assert.match(page,/Revisar y gestionar/);
 assert.match(page,/controlApi\('inspect',account\)/);
 assert.match(page,/window\.prompt\('Para confirmar, escribí el correo completo/);
 assert.match(page,/window\.confirm\(confirmation/);
 assert.match(page,/controlApi\(action,account,\{reason:text,confirmation\}\)/);
 assert.match(page,/El borrado global con historiales de AeroSuite no está habilitado/);
});
