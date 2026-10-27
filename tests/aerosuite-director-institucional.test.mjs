import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../utilidades/gestion-aeronautica/',import.meta.url);
const admission=fs.readFileSync(new URL('ingreso-escuela.html',root),'utf8');
const school=fs.readFileSync(new URL('portal-escuela.html',root),'utf8');
const superadmin=fs.readFileSync(new URL('superadministrador.html',root),'utf8');
const demo=fs.readFileSync(new URL('demo-autorizacion.html',root),'utf8');

assert.match(admission,/id="signInPanel" hidden/,'No mostrar el formulario hasta verificar sesión');
assert.match(admission,/id="verifiedPanel" hidden/,'No mostrar aceptación sin autenticar');
assert.match(admission,/auth\.signInWithPassword/,'Ingreso personal usa Supabase Auth');
assert.match(admission,/auth\.getUser/,'Validar sesión contra servidor');
assert.match(admission,/\.rpc\('aerosuite_accept_invitation_role'/,'La invitación selecciona exactamente el rol asignado');
assert.match(admission,/\.rpc\('aerosuite_accept_my_invitation'/,'Los enlaces anteriores mantienen compatibilidad');
assert.match(admission,/p_institution_id:schoolId/,'Invitación atada al identificador institucional');
assert.match(admission,/\.rpc\('aerosuite_my_institution_access'/,'Lectura por membresía');
assert.match(admission,/auth\.signUp/,'Alta de cuenta directamente en AeroSuite');
assert.match(admission,/auth\.resetPasswordForEmail/,'Recuperación de clave dentro de AeroSuite');
assert.match(admission,/emailRedirectTo:activationUrl/,'Verificación redirigida a AeroSuite');
assert.match(admission,/Cambiar de cuenta/);
assert.match(admission,/storageKey:'aerosuite-institucional-v2-auth'/,'La autenticación institucional utiliza una sesión distinta a Gente de Vuelo');
assert.match(admission,/input\.value=''/,'Los campos de usuario y contraseña deben empezar vacíos');
assert.match(admission,/autocomplete="off" readonly/,'Los datos del Superadministrador no deben autocompletarse');
assert.match(admission,/showPanel\('registerPanel'\)/,'La invitación empieza con la creación de una cuenta nueva');
assert.match(admission,/location\.replace\(portalUrl\)/,'El ingreso confirmado abre directamente el portal del rol');
assert.match(admission,/normalizeError\(error\)/,'Mensaje útil para credenciales incorrectas');
assert.match(admission,/emailRedirectTo:activationUrl/,'La verificación retorna a AeroSuite');
assert.match(admission,/sesión institucional separada/i,'El ingreso no requiere incógnito gracias a las sesiones aisladas');

assert.match(school,/\.rpc\('aerosuite_my_institution_access'/,'Portal solo lee instituciones autorizadas');
assert.match(school,/institution_id===queryId/,'Consulta coincidencia institución');
assert.match(school,/school\.my_role==='administrador'&&school\.can_access/,'Solo el director puede invitar');
assert.match(school,/storageKey:'aerosuite-institucional-v2-auth'/,'El portal comparte únicamente la sesión institucional');
assert.match(school,/data-visible-role="administrador"/,'Portal administrador separado');
assert.match(school,/data-visible-role="instructor"/,'Portal instructor separado');
assert.match(school,/data-visible-role="alumno"/,'Portal alumno separado');
assert.match(school,/card\.dataset\.visibleRole!==school\.my_role/,'No mostrar tarjetas de otros roles');
assert.match(school,/x\.institution_id===queryId&&\(!requestedRole\|\|x\.my_role===requestedRole\)/,'Consulta vinculada a institución y rol recibidos');
assert.match(school,/name="role" type="radio" value="instructor"/,'Invitaciones de instructores');
assert.match(school,/name="role" type="radio" value="alumno"/,'Invitaciones de alumnos');
assert.match(school,/client\.functions\.invoke\('aerosuite-invitations'/,'Correo enviado desde función autorizada');
assert.match(school,/Pendiente de integración segura/,'No habilitar operaciones de la institución todavía');
assert.doesNotMatch(school,/\.from\('aerosuite_institutions'\)/,'El portal no puede leer registros generales');
assert.doesNotMatch(school,/\.from\('site_admins'\)/,'El portal no permite heredar Superadministración');
assert.match(superadmin,/ingreso-escuela\.html\?institucion=/,'Panel central proporciona acceso a prueba');
assert.match(superadmin,/sendDirectorInvite/,'Envío real del director desde Superadministrador');
assert.match(superadmin,/last_sent_at/,'Diferenciar invitación creada del correo realmente enviado');
assert.match(superadmin,/className='institution-card'/,'Cada institución tiene un recuadro propio');
assert.match(superadmin,/className='institution-actions'/,'Las acciones pertenecen al recuadro de esa institución');
assert.match(superadmin,/erase\.textContent='Eliminar institución'/,'Debe existir acción de eliminar institución');
assert.doesNotMatch(superadmin,/window\.prompt\(/,'Eliminar no debe solicitar escribir el nombre');
assert.match(superadmin,/window\.confirm\('¿Eliminar definitivamente la institución/,'Una única confirmación identifica la institución');
assert.match(superadmin,/p_institution_id:row\.id,p_confirm_name:row\.name/,'La eliminación envía el ID y el nombre de la tarjeta seleccionada');
assert.match(superadmin,/\.rpc\('aerosuite_delete_institution'/,'La eliminación va por RPC controlada por Superadministrador');
assert.match(superadmin,/readFunctionError\(error,data\)/,'Mostrar el error real del servicio de email');
assert.match(superadmin,/<select name="plan" required><option value="essential">Essential<\/option><option value="pro">Pro<\/option><\/select>/,'Solo se muestran Essential y Pro en el Superadministrador');
assert.match(superadmin,/!\['essential','pro'\]\.includes\(payload\.plan\)/,'Validación client-side de planes vigentes');
assert.doesNotMatch(superadmin,/<option value="(institucional|aeroclub_pro|sin_asignar)">/,'No quedan planes comerciales anteriores');
assert.match(demo,/<select id="schoolPlan"><option value="essential">Essential<\/option><option value="pro">Pro<\/option><\/select>/,'La demo usa los mismos dos planes');
assert.match(superadmin,/El correo NO se envió/,'No declarar éxito si la función devuelve error');
assert.doesNotMatch(superadmin,/<option value="pending">/,'No mostrar Pendiente de habilitación');
assert.doesNotMatch(superadmin,/Habilitar 30 días y enviar invitación/,'No pedir habilitar una prueba ya automática');
assert.doesNotMatch(superadmin,/async function enableTrialAndInvite/,'No conservar el circuito antiguo de pendiente');
assert.match(superadmin,/id="statusEditLabel" hidden/,'Ocultar el selector de estado en altas nuevas');
assert.match(superadmin,/id="initialTrialNotice"/,'Mostrar la prueba automática en el formulario');
assert.match(superadmin,/status:editingId\?String\(raw\.get\('status'\)\):'trial'/,'Las nuevas instituciones siempre se registran con estado de prueba');
assert.match(superadmin,/statusField\.value='trial'/,'Restablecer formulario con prueba gratuita');
assert.match(superadmin,/statusEditLabel\.hidden=false/,'Permitir gestión posterior del estado a instituciones existentes');
assert.match(superadmin,/Enviar invitación al director/,'El botón de invitación sigue disponible en las tarjetas activas');



for(const [name,html] of [['ingreso-escuela.html',admission],['portal-escuela.html',school]]){
 const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,name+': un único controlador local');
 new vm.Script(scripts[0][1],{filename:name});
 assert.doesNotMatch(html,/service_role|SUPABASE_SERVICE_ROLE_KEY/,'No exponer clave privilegiada');
}
console.log('PASS: ingreso de director separado del Superadministrador, permisos verificados y módulos bloqueados');
