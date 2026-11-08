'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261108060853_aerosuite_trial_expiry_immediate_readonly_20261108.sql'),'utf8');
test('La prueba termina exactamente en la fecha de vencimiento, sin gracia adicional',()=>{
 assert.match(sql,/when p_status='trial' and p_trial_ends_at>p_as_of then 'trial'/);
 assert.match(sql,/when p_status='trial' and p_trial_ends_at is not null then 'read_only'/);
 assert.doesNotMatch(sql,/interval '15 days'/);
});
test('Licencia activa vencida queda solo lectura y un plan desconocido bloquea',()=>{
 assert.match(sql,/when p_status='active' and p_license_ends_at>p_as_of then 'active'/);
 assert.match(sql,/when p_status='active' and p_license_ends_at is not null then 'read_only'/);
 assert.match(sql,/else 'blocked'/);
});
test('El portal conserva consultas en licencia vencida pero deshabilita escrituras',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.aerosuite_my_institution_access_v2/);
 assert.match(sql,/ent\.mode<>'blocked'/);
 assert.match(sql,/ent\.mode in \('trial','active'\)/);
 assert.match(sql,/null::timestamptz/);
});
