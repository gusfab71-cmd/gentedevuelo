'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const base=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(base,'supabase/migrations/20261108082500_aerosuite_reconciliation_readonly_items.sql'),'utf8');
const html=fs.readFileSync(path.join(base,'utilidades/gestion-aeronautica/conciliacion-institucional.html'),'utf8');
const portal=fs.readFileSync(path.join(base,'utilidades/gestion-aeronautica/portal-escuela.html'),'utf8');
test('La conciliación es de consulta con permisos de Dirección y Secretaría',()=>{
 assert.match(sql,/RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''/);
 assert.match(sql,/m\.role IN \('administrador','secretaria'\)/);
 assert.match(sql,/m\.user_id=v_actor/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.aerosuite_reconciliation_open_items\(uuid,integer\) FROM PUBLIC,anon/);
 assert.match(sql,/'automatically_changed',false/);
 assert.doesNotMatch(sql,/\bUPDATE public\.aerosuite_flight|\bDELETE FROM public\.aerosuite_flight/i);
});
test('Clasifica sin inventar deudas, distingue ausencia de informes y caja sin matrícula',()=>{
 for(const label of ['approved_unsettled','checkout_without_aircraft','past_booking_without_report','checkout_report_minutes_mismatch'])
  assert.ok(sql.includes(label),label);
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM public\.aerosuite_student_debts/);
 assert.match(sql,/AND r\.status='approved'/);
 assert.match(sql,/No crear deuda automática/);
 assert.match(sql,/No inferir automáticamente/);
});
test('La respuesta limita resultados y no filtra otras instituciones',()=>{
 assert.match(sql,/b\.institution_id=p_institution_id/);
 assert.match(sql,/c\.institution_id=p_institution_id/);
 assert.match(sql,/least\(greatest\(coalesce\(p_limit,100\),1\),200\)/);
 assert.match(sql,/v_mode NOT IN \('trial','active'\)/);
});
test('La pantalla es válida y el acceso desde el portal solo Director/Secretaría',()=>{
 assert.match(html,/aerosuite_reconciliation_open_items/);
 assert.match(html,/aerosuite_my_institution_access_v2/);
 assert.match(html,/No se modificó ninguna operación/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1].trim()).filter(Boolean);
 scripts.forEach(js=>assert.doesNotThrow(()=>new vm.Script(js)));
 assert.match(portal,/id="aerosuiteReconcileLink" data-visible-role="administrador secretaria"/);
 assert.match(portal,/conciliacion-institucional\.html\?institucion=/);
});
