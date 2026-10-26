import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../utilidades/gestion-aeronautica/',import.meta.url);
const demo = fs.readFileSync(new URL('demo-autorizacion.html',root),'utf8');
const superadmin = fs.readFileSync(new URL('superadministrador.html',root),'utf8');

assert.match(superadmin,/id="adminContent" hidden/,'El contenido administrativo se oculta hasta verificar el rol');
assert.match(superadmin,/href="demo-autorizacion\.html"/,'Superadministrador debe enlazar la simulación');
assert.match(demo,/id="demo" class="layout" hidden/,'La demo debe comenzar oculta');
assert.match(demo,/from\('aerosuite_superadmins'\)\.select\('user_id'\)/,'Verificar el rol específico de AeroSuite');
assert.match(demo,/permission\.data\.user_id!==user\.id/,'Comparar rol con la identidad autenticada');
assert.match(demo,/data-screen="0"/);
assert.match(demo,/data-screen="1"/);
assert.match(demo,/data-screen="2"/);
assert.match(demo,/data-screen="3"/);
assert.match(demo,/data-screen="4"/);
assert.match(demo,/Simular autorización de 30 días/);
assert.match(demo,/Simular correo enviado/);
assert.match(demo,/Simular activación del responsable/);
assert.match(demo,/\.invalid/,'Usar ejemplo de correo que no se puede enviar');
assert.match(demo,/No envía correos/i);
assert.match(demo,/no crea escuelas/i);
// El simulador solo consulta su rol, y no toca los registros operativos.
assert.doesNotMatch(demo, /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|fetch\s*\(|inviteUserByEmail|signUp\s*\(/i,
 'La demo no debe modificar bases de datos, gestionar usuarios ni llamar endpoints');
const scripts=[...demo.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'Esperamos exactamente un script de interacción');
new vm.Script(scripts[0][1],{filename:'demo-autorizacion.html'});
console.log('PASS: camino demo de instituciones aislado, con cinco etapas y sin operaciones reales');
