'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(base,'assets/comunidad.js'),'utf8');
const css=fs.readFileSync(path.join(base,'assets/comunidad.css'),'utf8');
const menu=js.slice(js.indexOf('function account(){'),js.indexOf('async function refreshUnreadNotificationsBadge(){'));

test('Menú: presenta Control global de cuentas y Padrón institucional',()=>{
 assert.match(menu,/link\('Control global de cuentas','utilidades\/gestion-aeronautica\/superadmin-cuentas\.html'/);
 assert.match(menu,/link\('Padrón institucional','utilidades\/gestion-aeronautica\/superadministrador\.html#registros-aerosuite'/);
 assert.match(menu,/link\('Instituciones y licencias','utilidades\/gestion-aeronautica\/superadministrador\.html'/);
});
test('Menú: los cinco accesos de AeroSuite están reservados al superadministrador',()=>{
 assert.match(menu,/const aeroSuiteLinks=isAeroSuiteSuperadmin\?/);
 for(const entry of ['Control global de cuentas','Padrón institucional','Instituciones y licencias','Centro de Testeo Permanente','Auditorías automáticas']){
  assert.ok(menu.includes(`link('${entry}'`),entry);
 }
 assert.match(js,/isAeroSuiteSuperadmin=checked\(await db\.from\('aerosuite_superadmins'\)/);
});
test('Menú: mantiene las herramientas de la comunidad bajo los permisos originales',()=>{
 assert.match(menu,/const communityAdminLinks=isAdmin\?/);
 assert.match(menu,/const siteAdminLinks=isOwnerAdmin\?/);
 for(const label of ['Registros incompletos','Registro manual','Comunicados','Revisión de AeroChat','Historiales de mantenimiento','Conocimiento de Robert Shimoda','Almacenamiento','Video de portada','Editar tarjetas de portada','Mover logo y textos']){
  assert.ok(menu.includes(label),label);
 }
});
test('Menú: conserva la navegación personal, cierre y estilos de secciones',()=>{
 assert.match(menu,/group\('Mi espacio',personalLinks,'personal'\)/);
 assert.match(menu,/group\('Administración',adminLinks,'admin'\)/);
 assert.match(menu,/data-action="logout"/);
 assert.match(css,/\.account-menu-panel \.account-admin-section-title\{/);
});
