'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const fix=fs.readFileSync(path.join(root,'supabase/migrations/20261108073000_aerosuite_institution_delete_pilot_authorizations_storage_guard.sql'),'utf8');
const revoke=fs.readFileSync(path.join(root,'supabase/migrations/20261108071500_revoke_anonymous_security_definer_triggers.sql'),'utf8');
test('Eliminar institución requiere confirmación y cuenta superadmin',()=>{
 assert.match(fix,/public\.aerosuite_superadmins/);
 assert.match(fix,/p_confirm_name<>v_row\.name/);
 assert.match(fix,/El Laboratorio AeroSuite permanente/);
 assert.match(fix,/aerosuite_permanent_test_lab/);
});
test('Eliminar institución limpia sus verificaciones de piloto, pero no las de otras escuelas',()=>{
 assert.match(fix,/DELETE FROM public\.aerosuite_pilot_authorizations\s+WHERE institution_id=p_institution_id/);
 assert.match(fix,/GET DIAGNOSTICS v_pilot_authorizations=ROW_COUNT/);
 assert.match(fix,/removed_pilot_authorizations/);
 assert.match(fix,/delete from public\.aerosuite_institution_members where institution_id=p_institution_id/);
});
test('No permite borrar una escuela dejando archivos institucionales huérfanos',()=>{
 assert.match(fix,/FROM storage\.objects obj/);
 assert.match(fix,/bucket_id='aerosuite-academia-institucional'/);
 assert.match(fix,/storage\.foldername\(obj\.name\)/);
 assert.match(fix,/Realizá y verificá su eliminación autorizada desde Storage/);
});
test('Funciones privilegiadas de trigger no mantienen EXECUTE para usuarios anónimos',()=>{
 assert.match(revoke,/REVOKE ALL ON FUNCTION public\.aerosuite_revoke_changed_pilot_license\(\) FROM PUBLIC,anon,authenticated/);
 assert.match(revoke,/REVOKE ALL ON FUNCTION public\.gdv_queue_replaced_home_media\(\) FROM PUBLIC,anon,authenticated/);
});
