'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('docs/gdv-propuesta-padron-global-cuentas-2026-11-08.sql');
const panel=read('utilidades/gestion-aeronautica/superadmin-cuentas.html');
const superadmin=read('utilidades/gestion-aeronautica/superadministrador.html');

test('Padrón global: solo Superadministración comprobada en servidor',()=>{
 assert.match(sql,/SECURITY DEFINER SET search_path TO ''/i);
 assert.match(sql,/WHERE s\.user_id=\(SELECT auth\.uid\(\)\)/i);
 assert.match(sql,/RAISE EXCEPTION 'Solo Superadministración puede consultar el padrón de cuentas.'/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.gdv_superadmin_global_accounts\(integer,integer\)\s+FROM PUBLIC,anon/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.gdv_superadmin_global_accounts\(integer,integer\)\s+TO authenticated/i);
});
test('Padrón cruza identidad, comunidad, invitaciones y cinco roles de la institución',()=>{
 for(const source of ['auth.users','public.profiles','public.aerosuite_institution_members',
  'public.aerosuite_institutions','public.aerosuite_institution_invitations',
  'public.site_admins','public.aerosuite_superadmins']){
  assert.ok(sql.includes(source),source);
 }
 assert.match(sql,/ORDER BY u\.created_at DESC,u\.id DESC/i);
 assert.match(sql,/p_limit NOT BETWEEN 1 AND 200/i);
});
test('Una cuenta no vinculada se marca para revisión, no se declara no autorizada',()=>{
 assert.match(sql,/Sin vínculo detectado · revisar/i);
 assert.match(panel,/nunca implica eliminación automática/i);
 assert.doesNotMatch(sql,/DELETE FROM auth\.users|UPDATE auth\.users/i);
});
test('Acceso al nuevo panel solo tras comprobación de autenticación y privilegios',()=>{
 assert.match(panel,/db\.auth\.getUser\(\)/);
 assert.match(panel,/db\.from\('aerosuite_superadmins'\)/);
 assert.match(panel,/db\.rpc\('gdv_superadmin_global_accounts'/);
 assert.match(superadmin,/href="superadmin-cuentas\.html">Control global de cuentas/);
});
test('El panel no guarda permisos en URL ni ejecuta acciones destructivas',()=>{
 assert.doesNotMatch(panel,/\.delete\(|auth\.admin\.deleteUser\(|\.update\(|\.insert\(/);
 assert.match(panel,/createElement\(tag\)/);
 assert.match(panel,/x\.textContent=text/);
 assert.match(panel,/Este panel es de consulta/);
});
