'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','docs',
  'gdv-guard-baja-comunidad-cuentas-aerosuite-2026-11-08.sql'),'utf8');

test('La baja comunitaria debe autorizar antes de revelar vinculaciones',()=>{
 const auth=sql.indexOf("IF auth.uid() IS NULL OR NOT EXISTS");
 const lookup=sql.indexOf("SELECT u.email INTO v_target_email");
 const guard=sql.indexOf("IF EXISTS (SELECT 1 FROM public.aerosuite_institution_members");
 const del=sql.indexOf("RETURN public.gdv_admin_delete_member_integral_core");
 assert.ok(auth>0&&lookup>auth&&guard>lookup&&del>guard);
 assert.match(sql,/FROM public\.site_admins s WHERE s\.user_id=auth\.uid\(\)/);
 assert.match(sql,/p_confirmation IS DISTINCT FROM 'ELIMINAR CUENTA Y CONTENIDO'/);
});

test('No permite borrar usuarios con vinculacion institucional, credenciales o invitaciones',()=>{
 for(const table of [
  'aerosuite_institution_members',
  'aerosuite_pilot_credentials',
  'aerosuite_pilot_authorizations',
  'aerosuite_role_declarations',
  'aerosuite_member_profiles',
  'aerosuite_institution_invitations'
 ]) assert.ok(sql.includes('public.'+table),table);
 assert.match(sql,/lower\(btrim\(i\.email\)\)=lower\(btrim\(v_target_email\)\)/);
 assert.match(sql,/FROM auth\.users u WHERE u\.id=p_user FOR UPDATE/);
 assert.match(sql,/Esta cuenta está vinculada a AeroSuite/);
});

test('Mantiene el core no expuesto, sin cambios destructivos ni privilegios abiertos',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.gdv_admin_delete_member_integral_core\(uuid\)/);
 assert.match(sql,/FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/SECURITY DEFINER SET search_path TO ''/);
 assert.doesNotMatch(sql,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b|\bGRANT EXECUTE\b/i);
});
