'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','docs',
 'aerosuite-fix-rls-index-performance-2026-11-08.sql'),'utf8');

test('Las políticas de Academia conservan membresía y usan initplan para auth.uid',()=>{
 assert.match(sql,/ALTER POLICY aerosuite_academy_resource_insert/i);
 assert.match(sql,/ALTER POLICY aerosuite_academy_resource_delete/i);
 assert.match(sql,/created_by=\(SELECT auth\.uid\(\)\)/i);
 assert.match(sql,/aerosuite_academy_authorized\(institution_id,'write'\)/i);
 assert.match(sql,/aerosuite_academy_authorized\(institution_id,'manage'\)/i);
 assert.doesNotMatch(sql,/\bGRANT\b|\bDISABLE ROW LEVEL SECURITY\b/i);
});

test('Solo retira índice financiero redundante no UNIQUE sin tocar asientos',()=>{
 assert.match(sql,/DROP INDEX IF EXISTS public\.aerosuite_money_movement_period_idx/i);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|TRUNCATE|DROP INDEX IF EXISTS public\.aerosuite_money_inst_created/i);
});
