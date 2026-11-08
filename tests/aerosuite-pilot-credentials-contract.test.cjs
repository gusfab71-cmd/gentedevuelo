'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('docs/aerosuite-legajos-pilotos-ppa-pca-propuesta-2026-11-08.sql');
const profile=read('utilidades/gestion-aeronautica/mi-ficha-alumno.html');
const portal=read('utilidades/gestion-aeronautica/portal-escuela.html');

test('Legajo PPA/PCA: licencia declarada con selección explícita y conserva datos antiguos',()=>{
 assert.match(profile,/name="pilot_license_type"><option value=""/);
 assert.match(profile,/PPA · Piloto Privado de Avión/);
 assert.match(profile,/PCA · Piloto Comercial de Avión/);
 assert.match(profile,/Licencia anterior declarada:/);
 assert.match(profile,/input\.add\(new Option/);
});
test('Registra solo fechas y datos declarados: nunca concede autorización para volar',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.aerosuite_pilot_credentials/i);
 for(const field of ['medical_expires_on','license_expires_on','ratings_expires_on','medical_certificate_type','ratings_declared']){
  assert.match(sql,new RegExp('\\b'+field+'\\b'));
 }
 assert.doesNotMatch(sql,/UPDATE public\.aerosuite_pilot_authorizations|INSERT INTO public\.aerosuite_pilot_authorizations|delete\s+from\s+public\.aerosuite_pilot_authorizations/i);
 assert.match(profile,/No acreditan vigencia ni permiten volar sin instructor/);
});
test('Fechas privadas: RLS propietario, sin acceso anónimo ni eliminación arbitraria',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/REVOKE ALL ON TABLE public\.aerosuite_pilot_credentials FROM PUBLIC,anon,authenticated/i);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE ON TABLE public\.aerosuite_pilot_credentials TO authenticated/i);
 assert.doesNotMatch(sql,/GRANT DELETE ON TABLE public\.aerosuite_pilot_credentials TO authenticated/i);
 assert.match(sql,/user_id=\(SELECT auth\.uid\(\)\)/i);
 assert.match(sql,/WHERE d\.user_id=\(SELECT auth\.uid\(\)\) AND d\.role='pilot'/);
});
test('Dirección y Secretaría consultan únicamente sus pilotos mediante RPC protegida',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_pilot_candidates\(p_institution_id uuid\)/i);
 assert.match(sql,/m\.institution_id=p_institution_id AND m\.user_id=v_actor/);
 assert.match(sql,/m\.role IN\('administrador','secretaria'\)/);
 assert.match(sql,/WHERE m\.institution_id=p_institution_id AND m\.role='piloto'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_pilot_candidates\(uuid\) FROM PUBLIC,anon/i);
 assert.match(portal,/if\(isManager\)\{/);
 assert.match(portal,/client\.rpc\('aerosuite_pilot_candidates'/);
});
test('Avisos de 30 días, incompletos y vencidos no equivalen a autorización institucional',()=>{
 assert.match(profile,/days<0\)expired=true/);
 assert.match(profile,/days<=30\)soon=true/);
 assert.match(profile,/Esto NO acredita habilitación para volar/);
 assert.match(profile,/Todavía no se declararon vencimientos/);
 assert.match(portal,/Licencia pendiente de verificación institucional/);
 assert.match(portal,/Verificación institucional registrada/);
 assert.match(portal,/pilot\.verified/);
});
test('Sin despliegue de la tabla, la ficha principal sigue disponible sin pérdida silenciosa',()=>{
 assert.match(profile,/\['PGRST205','42P01'\]\.includes\(error\.code\)/);
 assert.match(profile,/pilotCredentialsEnabled=false/);
 assert.match(profile,/!get\('role_pilot'\)\.checked\|\|!pilotCredentialsEnabled/);
 assert.match(profile,/Los vencimientos aeronáuticos todavía no pueden guardarse/);
 assert.match(profile,/await saveRoles\(\);\s*await savePilotCredentials\(\)/);
});
test('Scripts embebidos de ambas pantallas son sintácticamente válidos',()=>{
 for(const [name,source] of [['perfil',profile],['portal',portal]]){
  const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
  assert.ok(scripts.length,name);
  for(const sourceJs of scripts)assert.doesNotThrow(()=>new vm.Script(sourceJs),name);
 }
});
