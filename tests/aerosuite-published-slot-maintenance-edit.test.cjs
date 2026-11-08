'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','docs',
  'aerosuite-fix-mantenimiento-turnos-publicados-2026-11-08.sql'),'utf8');

test('Toda edición relevante de un turno publicado dispara control de mantenimiento',()=>{
 assert.match(sql,/BEFORE INSERT OR UPDATE OF published_at,resource_label,starts_at,activity,institution_id/i);
 assert.match(sql,/FOR EACH ROW EXECUTE FUNCTION aerosuite_internal\.aerosuite_guard_published_flight_maintenance\(\)/i);
 assert.match(sql,/new\.resource_label IS NOT DISTINCT FROM old\.resource_label/i);
 assert.match(sql,/new\.starts_at IS NOT DISTINCT FROM old\.starts_at/i);
 assert.match(sql,/new\.activity IS NOT DISTINCT FROM old\.activity/i);
 assert.match(sql,/new\.institution_id IS NOT DISTINCT FROM old\.institution_id/i);
 assert.match(sql,/new\.published_at IS NOT DISTINCT FROM old\.published_at/i);
});

test('Solo omite validación si el vuelo publicado conserva identidad y datos clave',()=>{
 assert.match(sql,/TG_OP='UPDATE'/i);
 assert.match(sql,/old\.published_at IS NOT NULL/i);
 assert.match(sql,/v_actor IS NULL/i);
 assert.match(sql,/aerosuite_maintenance_alerts\(new\.institution_id\)/i);
 assert.match(sql,/alert\.value->>'level'='due'/i);
 assert.match(sql,/RAISE EXCEPTION 'Publicación bloqueada por vencimiento de mantenimiento/i);
 assert.doesNotMatch(sql,/\bDELETE FROM\b|\bTRUNCATE\b|\bDROP TABLE\b/i);
});
