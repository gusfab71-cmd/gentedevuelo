import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../utilidades/gestion-aeronautica/',import.meta.url);
const admission=fs.readFileSync(new URL('ingreso-escuela.html',root),'utf8');
const school=fs.readFileSync(new URL('portal-escuela.html',root),'utf8');
const superadmin=fs.readFileSync(new URL('superadministrador.html',root),'utf8');
const emailSender=fs.readFileSync(new URL('../../supabase/functions/aerosuite-invitations/index.ts',root),'utf8');
const demo=fs.readFileSync(new URL('demo-autorizacion.html',root),'utf8');
const viewer=fs.readFileSync(new URL('superadmin-visor-roles.html',root),'utf8');

assert.match(admission,/id="signInPanel" hidden/,'No mostrar el formulario hasta verificar sesión');
assert.match(admission,/id="verifiedPanel" hidden/,'No mostrar aceptación sin autenticar');
assert.match(admission,/auth\.signInWithPassword/,'Ingreso personal usa Supabase Auth');
assert.match(admission,/auth\.getUser/,'Validar sesión contra servidor');
assert.match(admission,/\.rpc\('aerosuite_accept_invitation_role'/,'La invitación selecciona exactamente el rol asignado');
assert.match(admission,/\.rpc\('aerosuite_accept_my_invitation'/,'Los enlaces anteriores mantienen compatibilidad');
assert.match(admission,/p_institution_id:schoolId/,'Invitación atada al identificador institucional');
assert.match(admission,/\.rpc\('aerosuite_my_institution_access_v2'/,'Ingreso consulta los derechos de cortesía y solo lectura');
assert.match(emailSender,/auth\.admin\.generateLink\(\{type:"magiclink",email\}\)/,'La invitación verifica identidad con Magic Link personal');
assert.match(emailSender,/\.is\("revoked_at",null\)\.limit\(1\)/,'Una invitación aceptada que fue revocada no impide invitar nuevamente');
assert.match(admission,/Necesito una invitación nueva/,'El ingreso anterior no induce a usar registro con segundo correo');
assert.match(admission,/una invitación nueva/,'Enlace sin token remite al director para reenvío');
assert.match(emailSender,/properties\?\.hashed_token/,'Se toma únicamente el token hash emitido por Supabase');
assert.match(emailSender,/#token_hash=/,'Token en fragmento para evitar enviarlo por HTTP al servidor web');
assert.match(emailSender,/roleLabels\[role\]/,'Misma invitación para administrador, instructor y alumno');
assert.match(emailSender,/role==="administrador"/,'Solo Superadministrador autoriza directores');
assert.match(emailSender,/member\.data/,'Director verificado autoriza instructores y alumnos');
assert.doesNotMatch(emailSender,/body:JSON\.stringify\(\{[^}]*password/,'Ninguna contraseña viaja por el correo');

assert.match(admission,/id="welcomePanel" hidden/,'Nueva pantalla para crear contraseña desde el propio enlace');
assert.match(admission,/db\.auth\.verifyOtp\(\{token_hash:oneTimeToken,type:oneTimeType\}\)/,'Verificar el enlace con el tipo real que emitió Supabase Auth');
assert.match(admission,/value\.length===9/,'La contraseña institucional exige nueve caracteres exactos');
assert.match(emailSender,/verification_type==="signup"/,'Si la primera invitación crea la cuenta, se vuelve a generar un enlace de acceso');
assert.match(admission,/passwordSetupRequired=true/,'Crear contraseña solo luego de verificar enlace');
assert.match(admission,/db\.auth\.updateUser\(\{password\}\)/,'Guardar contraseña directamente en sesión verificada');
assert.match(admission,/await verifyAndEnter\(\)/,'Una vez creada, ingresar al portal sin segundo correo');
assert.match(admission,/existingAccountButton/,'Cuenta existente puede conservar contraseña');
assert.match(admission,/history\.replaceState\(null,''/,'Eliminar token de URL visible tras procesarlo');
assert.match(admission,/data-password-target="welcomePassword"/,'Ojito en nueva clave');
assert.match(admission,/data-password-target="welcomeRepeat"/,'Ojito al repetir nueva clave');
assert.match(admission,/oneTimeToken/,'Detectar token en invitación');
assert.match(admission,/const humanRole=selectedRole==='administrador'/,'La activación usa el rol exacto del enlace');
assert.match(admission,/auth\.signUp/,'Alta de cuenta directamente en AeroSuite');
assert.match(admission,/id="confirmationPanel" hidden/,'Crear cuenta habilita un segundo paso claro de confirmación');
assert.match(admission,/id="resendForm"/,'Permitir reenviar confirmación desde AeroSuite');
assert.match(admission,/auth\.resend\(\{type:'signup',email,options:\{emailRedirectTo:activationUrl\}\}\)/,'Reenvío conserva la URL original y el rol de invitación');
assert.match(admission,/showPanel\('confirmationPanel'\)/,'Mostrar verificación tras registrarse cuando no hay sesión');
assert.match(admission,/if\(data\?\.session\)\{await verifyAndEnter\(\);return\}/,'Si el alta devuelve sesión, ingresar automáticamente');
assert.match(admission,/onAuthStateChange/,'Atender evento de ingreso tras confirmar correo');
assert.match(admission,/event==='SIGNED_IN'/,'Continuar automáticamente tras confirmar por el segundo correo');
assert.match(admission,/\.password-eye/,'Botón accesible para mostrar contraseña');
assert.match(admission,/data-password-target="password"/,'Ojito del ingreso');
assert.match(admission,/data-password-target="signupPassword"/,'Ojito de contraseña nueva');
assert.match(admission,/data-password-target="signupRepeat"/,'Ojito de confirmación de contraseña');
assert.match(admission,/data-password-target="newPassword"/,'Ojito de recuperación de contraseña');
assert.match(admission,/id="showConfirmationFromLogin"/,'Acceso a verificar correo también desde pantalla de inicio');
assert.match(admission,/id="confirmationEmail"/,'Reenvío de confirmación a dirección elegida');
assert.match(admission,/authenticationError\.has\('error_code'\)/,'Manejo de enlace de verificación caducado');
assert.match(admission,/El enlace de confirmación no pudo completarse o venció/,'Error explicado al usuario');
assert.match(admission,/no hace falta volver a crearla ni ingresarla de nuevo/i,'Explicar que no se repite la contraseña');

assert.match(admission,/aria-pressed/,'Control indica estado visible');
assert.match(admission,/input\.type=isVisible\?'text':'password'/,'Botón alterna ocultar y mostrar caracteres');

assert.match(admission,/auth\.resetPasswordForEmail/,'Recuperación de clave dentro de AeroSuite');
assert.match(admission,/emailRedirectTo:activationUrl/,'Verificación redirigida a AeroSuite');
assert.match(admission,/Cambiar de cuenta/);
assert.match(admission,/storageKey:'aerosuite-institucional-v2-auth'/,'La autenticación institucional utiliza una sesión distinta a Gente de Vuelo');
assert.match(admission,/input\.value=''/,'Los campos de usuario y contraseña deben empezar vacíos');
assert.match(admission,/autocomplete="off" readonly/,'Los datos del Superadministrador no deben autocompletarse');
assert.match(admission,/id="welcomePanel" hidden/,'La nueva invitación verificada abre el formulario de contraseña personal');
assert.match(admission,/location\.replace\(portalUrl\)/,'El ingreso confirmado abre directamente el portal del rol');
assert.match(admission,/normalizeError\(error\)/,'Mensaje útil para credenciales incorrectas');
assert.match(admission,/emailRedirectTo:activationUrl/,'La verificación retorna a AeroSuite');
assert.match(admission,/sesión institucional separada/i,'El ingreso no requiere incógnito gracias a las sesiones aisladas');

assert.match(school,/\.rpc\('aerosuite_my_institution_access_v2'/,'Portal solo lee instituciones autorizadas y estado de suscripción');
assert.match(school,/const isDirector=school\.my_role==='administrador'/,'Solo director visualiza sección comercial');
assert.match(school,/el\('schoolPlan'\)\.hidden=!isManager/,'Plan visible para Dirección y Secretaría, no para instructor o alumno');
assert.match(school,/el\('schoolExpiry'\)\.hidden=!isManager/,'Dirección y Secretaría comparten fecha de vencimiento');
assert.match(school,/el\('schoolAccessLine'\)\.hidden=!isManager/,'Dirección y Secretaría comparten el estado comercial');
assert.match(school,/el\('subscriptionNotice'\)\.hidden=!isManager/,'Dirección y Secretaría ven las mismas advertencias de licencia');
assert.match(school,/id="institutionSwitcher" hidden/,'El selector de institución permanece oculto con un solo vínculo');
assert.match(school,/accessibleInstitutions=data\.filter\(x=>x\.can_access&&/,'Solo ofrece instituciones habilitadas a la cuenta');
assert.match(school,/accessibleInstitutions\.length>1/,'Solo muestra el selector con dos o más accesos');
assert.match(school,/entry\.institution_id\)\+'&rol='\+encodeURIComponent\(entry\.my_role\)/,'El cambio de institución preserva el rol de ese vínculo');
assert.match(school,/id="directorPeoplePanel" hidden/,'Panel exclusivo de integrantes');
assert.match(school,/id="peopleList"/,'Listado de instructores y alumnos');
assert.match(school,/\.rpc\('aerosuite_director_people'/,'El listado está validado por RPC');
assert.match(school,/\.rpc\('aerosuite_manage_staff_remove'/,'El director desvincula personas mediante una RPC compartida y segura');
assert.match(school,/p_role:person\.role/,'La baja indica el rol exacto para no retirar un rol diferente');
assert.match(school,/p_institution_id:school\.institution_id/,'Las bajas indican explícitamente la escuela');
assert.match(school,/p_person_id:person\.person_id,p_kind:person\.kind/,'Las bajas indican miembro o invitación');
assert.match(school,/person\.kind==='integrante'\?'Desvincular':'Cancelar invitación'/,'El director puede cancelar invitaciones y desvincular cuentas');
assert.match(school,/if\(school\.can_write&&\(person\.role!=='secretaria'\|\|isDirector\)\)/,'El modo consulta no admite bajas y solo el director desvincula Secretaría');
assert.match(school,/window\.confirm\(msg\)/,'Una confirmación para dar de baja');
assert.match(school,/cuenta técnica exclusiva de prueba/i,'Baja de una cuenta de pruebas reinicia su identidad únicamente si es exclusiva');
assert.match(school,/data.removed_test_account/,'El director recibe el resultado del reinicio seguro');
assert.match(school,/institution_id===queryId/,'Consulta coincidencia institución');
assert.match(school,/if\(isManager&&school\.can_write\)/,'Dirección y Secretaría pueden invitar instructores y alumnos');
assert.match(school,/storageKey:'aerosuite-institucional-v2-auth'/,'El portal comparte únicamente la sesión institucional');
assert.match(school,/data-visible-role="administrador secretaria"/,'Dirección y Secretaría comparten el portal administrativo');
assert.match(school,/data-visible-role="instructor"/,'Portal instructor separado');
assert.match(school,/data-visible-role="alumno"/,'Portal alumno separado');
assert.match(school,/card\.dataset\.visibleRole\.split\(/,'La interfaz oculta las tarjetas no habilitadas para el rol');
assert.match(school,/x\.institution_id===queryId&&\(!requestedRole\|\|x\.my_role===requestedRole\)/,'Consulta vinculada a institución y rol recibidos');
assert.match(school,/name="role" type="radio" value="instructor"/,'Invitaciones de instructores');
assert.match(school,/name="role" type="radio" value="alumno"/,'Invitaciones de alumnos');
assert.match(school,/client\.functions\.invoke\('aerosuite-invitations'/,'Correo enviado desde función autorizada');
assert.match(school,/Turnera, informes de instrucción y Contaduría cuentan con funciones institucionales/,'No ocultar los módulos operativos que ya fueron habilitados');
assert.match(school,/mode==='grace'/,'Mostrar acceso normal durante los 15 días de cortesía');
assert.match(school,/mode==='read_only'/,'Mostrar modo consulta después de los 45 días');
assert.match(school,/grace_ends_at/,'Mostrar la fecha de fin de cortesía');
assert.match(school,/no se pueden crear nuevas reservas, invitar personas ni modificar datos/,'Solo consulta no concede escritura');
assert.match(superadmin,/id="graceCount"/,'El Superadministrador ve instituciones en cortesía');
assert.match(superadmin,/id="readOnlyCount"/,'El Superadministrador ve instituciones en modo consulta');
assert.match(superadmin,/id="instructorsTotal"/,'Resumen de instructores con acceso activado');
assert.match(superadmin,/id="studentsTotal"/,'Resumen de alumnos con acceso activado');
assert.match(superadmin,/\.rpc\('aerosuite_superadmin_staff_counts'\)/,'Las cantidades provienen de RPC exclusiva del Superadministrador');
assert.match(superadmin,/new Map\(\(staffCounts\.data\|\|\[\]\)\.map/,'Contadores asociados a la institución');
assert.match(superadmin,/addDetail\('Instructores activos'/,'Se cuentan instructores por escuela');
assert.match(superadmin,/addDetail\('Alumnos activos'/,'Se cuentan alumnos por escuela');
assert.match(superadmin,/addDetail\('Invitaciones pendientes'/,'No confundir cuentas con correos enviados');
assert.match(superadmin,/id="registros-aerosuite"/,'Debe existir un padrón central de registros');
assert.match(superadmin,/aerosuite_superadmin_registrations/,'La consulta agregada requiere autorización del Superadministrador');
assert.match(superadmin,/aerosuite_superadmin_manage_registration/,'La administración de accesos usa RPC limitada');
assert.match(superadmin,/registrationInstitution/,'Filtrar registros por institución');
assert.match(superadmin,/registrationRole/,'Filtrar registros por rol');
assert.match(superadmin,/registrationStatus/,'Filtrar registros por estado');
assert.match(admission,/aerosuite_record_my_registration/,'Las altas verificadas se registran cuando el usuario ingresa a AeroSuite');
assert.doesNotMatch(superadmin,/Gestionar cuentas|Probar el camino de una nueva escuela|href="demo-autorizacion\.html"/,'No hay acciones redundantes ni enlaces demo');
assert.match(superadmin,/personRole=\{/,'Los registros distinguen director, instructor y alumno');
assert.match(superadmin,/Las cuentas comunitarias y los accesos compartidos se conservan/,'El reinicio de pruebas protege cuentas compartidas y comunitarias');
assert.match(superadmin,/id="institutionTest"/,'El modo pruebas se habilita expresamente por institución');
assert.match(superadmin,/is_test:raw.get\('is_test'\)==='on'/,'La modalidad de prueba se guarda en Supabase');
assert.match(superadmin,/data.removed_test_account/,'El panel distingue cuentas purgadas de protegidas');
assert.match(superadmin,/data.removed_test_accounts/,'Se notifica el número de identidades purgadas al borrar una escuela');


assert.match(superadmin,/15\*86400000/,'Cálculo de 15 días de cortesía para el listado');
assert.doesNotMatch(school,/\.from\('aerosuite_institutions'\)/,'El portal no puede leer registros generales');
assert.doesNotMatch(school,/\.from\('site_admins'\)/,'El portal no permite heredar Superadministración');
assert.doesNotMatch(superadmin,/entry\.textContent='Probar ingreso'/,'Sin acceso de prueba redundante por escuela');
assert.doesNotMatch(superadmin,/btn\.textContent='Gestionar'/,'Sin botón Gestionar redundante en la tarjeta');
assert.match(superadmin,/editIcon\.className='institution-edit'/,'La edición institucional se conserva como icono discreto');
assert.match(superadmin,/editIcon\.addEventListener\('click',\(\)=>edit\(row\.id\)\)/,'El lápiz permite cambiar datos y licencia');
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




// Superadministración por institución: consultar nombres y correos solo al expandir la ficha.
assert.match(superadmin,/id="institutionSearch"/,'Buscar instituciones por nombre o correo de contacto');
assert.match(superadmin,/id="institutionKind"/,'Filtro escuela, aeroclub y aeródromo');
assert.match(superadmin,/id="institutionFilterCount"/,'Se muestra el total filtrado de instituciones');
assert.match(superadmin,/className='institution-roster'/,'Cada institución tiene su padrón particular');
assert.match(superadmin,/Ver nombres y correos del personal/,'Los nombres y correos se pueden desplegar');
assert.match(superadmin,/aerosuite_superadmin_institution_roster/,'Los datos personales se consultan por RPC protegida');
assert.match(superadmin,/p_institution_id:orgId/,'No se mezclan instituciones en la consulta de integrantes');
assert.match(superadmin,/person\.profile_name/,'Se muestra nombre del perfil si existe');
assert.match(superadmin,/Sin nombre de perfil/,'No se inventan nombres faltantes');
assert.match(superadmin,/person\.email/,'Siempre se muestra correo del integrante');
assert.match(superadmin,/x\.institution_id===orgId&&x\.kind==='invitacion'/,'Invitaciones pendientes también quedan separadas por institución');


assert.match(admission,/const recoveryFlow=query\.get\('recuperar'\)==='1'\|\|oneTimeType==='recovery'/,
 'Detectar recuperación antes de interpretar eventos Auth');
assert.match(admission,/recovering=recoveryFlow,recoveryLinkVerified=false,recoveryCompleted=false/,
 'Mantener bloqueo del ingreso hasta guardar la contraseña');
assert.match(admission,/if\(processing\|\|recovering\|\|\(recoveryFlow&&!recoveryCompleted\)\)return/,
 'El portal no se abre desde una sesión temporal de recuperación');
assert.match(admission,/redirectTo:recoveryUrl/,'El correo vuelve al flujo de recuperación explícito');
assert.match(admission,/event==='PASSWORD_RECOVERY'/,'Aceptar evento verificado de recuperación');
assert.match(admission,/data\.session\.access_token!==oneTimeHash\.get\('access_token'\)/,
 'Validar que la sesión procede del token incluido en el enlace');
assert.match(admission,/db\.auth\.verifyOtp\(\{token_hash:oneTimeToken,type:'recovery'\}\)/,
 'Permitir enlaces de recuperación con token_hash');
assert.match(admission,/if\(!recovering\|\|!recoveryLinkVerified\)/,
 'No permitir restablecer contraseña sin un enlace válido');
assert.match(admission,/if\(!data\?\.user\)throw Error\('No se confirmó la actualización de contraseña\.'/,
 'La actualización debe estar confirmada antes de continuar');
assert.match(admission,/recovering=false;recoveryCompleted=true;/,
 'Se habilita el portal solo después del cambio exitoso');
assert.match(admission,/history\.replaceState\(null,'',activationUrl\)/,
 'Quitar el marcador de recuperación cuando termina');
assert.match(admission,/byId\('backRecovery'\)\.hidden=true/,
 'No permitir saltarse el formulario desde el enlace verificado');
assert.ok(admission.indexOf('if(recoveryFlow){')<admission.indexOf('}else if(oneTimeToken){'),
 'Atender recuperación antes de las invitaciones normales');
assert.match(admission,/Guardar contraseña nueva e ingresar/,'Acción explícita y clara para recuperación');


const operations=fs.readFileSync(new URL('operaciones-institucionales.html',root),'utf8');
const fleet=fs.readFileSync(new URL('flota-institucional.html',root),'utf8');
assert.match(school,/id="chooseInstitution" class="panel" hidden/,'La selección de institución se muestra antes del portal');
assert.match(school,/id="chooseInstitutionList"/,'Se crean tarjetas independientes por cada institución');
assert.match(school,/accessibleInstitutions\.length>1&&!chosen/,'Elección inicial obligatoria si la cuenta tiene varios vínculos');
assert.match(school,/message\.textContent='Acceso verificado\. Seleccioná primero una institución/,'El usuario sabe qué hacer');
assert.match(school,/location\.assign\(institutionURL\(entry\)\)/,'Solo la tarjeta elegida abre la institución');
assert.match(school,/encodeURIComponent\(entry\.my_role\)\+'&elegida=1'/,'Preserva institución y rol de forma explícita');
assert.match(school,/el\('changeInstitution'\)\.addEventListener/,'Se puede cambiar de institución más tarde');
assert.match(school,/if\(!school\.can_access\)/,'No abre una institución bloqueada');
assert.match(operations,/id="thisWeek"/,'La turnera ofrece volver a esta semana');
assert.match(operations,/id="nextWeek"/,'La turnera permite avanzar a la siguiente semana');
assert.match(operations,/id="bookingFutureNotice"/,'Se explica cómo encontrar horarios futuros');
assert.match(operations,/b\.textContent="Libre · Reservar"/,'Los turnos futuros quedan identificados como reservables');
assert.match(operations,/if\(start\.getTime\(\)<=Date\.now\(\)\)/,'Solo los turnos que ya comenzaron se marcan como pasados');
assert.match(operations,/start=new Date\(date\+"T"\+time\+":00-03:00"\)/,'Los turnos se calculan en hora Argentina');
assert.match(operations,/return Array\.from\(\{length:7\},\(_,i\)=>addDays\(monday,i\)\)/,'Las semanas son independientes de la zona del navegador');
assert.match(operations,/class="today-head"/,'Se resalta visualmente el día actual');
assert.match(operations,/\+"&elegida=1";/,'Volver de la turnera conserva la elección');
assert.match(fleet,/\+"&elegida=1";/,'Volver de Flota conserva la elección');
const helpers=operations.match(/const artToday=\(\)=>[^\n]+\n\s*const addDays=\(value,days\)=>[^\n]+\n\s*const mondayOf=date=>[^\n]+/);
assert.ok(helpers,'Las funciones de calendario ART deben estar presentes');
class TestDate extends Date{static now(){return Date.parse('2026-10-28T12:50:00-03:00')}}
const h=vm.runInNewContext('(function(){'+helpers[0]+';return {artToday,addDays,mondayOf}})()',{Date:TestDate});
assert.equal(h.artToday(),'2026-10-28','La fecha ART no depende de la zona del dispositivo');
assert.equal(h.mondayOf('2026-10-28'),'2026-10-26','La semana actual comienza lunes');
assert.equal(h.addDays(h.mondayOf('2026-10-28'),7),'2026-11-02','La semana siguiente avanza siete días');
assert.ok(Date.parse('2026-10-28T14:00:00-03:00')>TestDate.now(),'Un turno futuro de hoy no puede considerarse pasado');
assert.ok(Date.parse('2026-10-26T09:30:00-03:00')<TestDate.now(),'Un turno de lunes ya pasado sigue bloqueado');


assert.match(superadmin,/Revisar portales por rol/,'El acceso al visor aparece en cada institución');
assert.match(superadmin,/superadmin-visor-roles\.html\?institucion=/,'El enlace lleva la institución concreta');
assert.match(viewer,/Control de portales por rol/,'El visor tiene una pantalla propia');
assert.match(viewer,/id="institutionChoice"/,'Permite seleccionar institución');
assert.match(viewer,/data-role="administrador"/,'Muestra Dirección');
assert.match(viewer,/data-role="secretaria"/,'Muestra Secretaría por separado');
assert.match(viewer,/selectedRole==='secretaria'\?'Secretaría gestiona instructores y alumnos/,'Secretaría no administra otras Secretarías');
assert.match(viewer,/data-role="instructor"/,'Muestra Instructor');
assert.match(viewer,/data-role="alumno"/,'Muestra Alumno');
assert.match(viewer,/querySelectorAll\('\[data-visible-role\]'\)/,'La vista extrae tarjetas del portal real');
assert.match(viewer,/fetch\('portal-escuela\.html'/,'El visor lee la plantilla de producción');
assert.match(viewer,/db\.from\('aerosuite_superadmins'\)/,'El visor exige rol de Superadministrador');
assert.match(viewer,/db\.auth\.getUser\(\)/,'El visor verifica identidad actual');
assert.match(viewer,/\.rpc\('aerosuite_superadmin_portal_health'/,'El visor consulta RPC agregada protegida');
assert.match(viewer,/id="checkSummary"/,'La pantalla muestra el resultado del diagnóstico');
assert.match(viewer,/instructor_cross_institution_overlap/,'Revisión de superposiciones entre escuelas');
assert.match(viewer,/negative_pack_balance/,'Revisión de packs');
assert.match(viewer,/double_settlement/,'Revisión de cobro doble');
assert.match(viewer,/completed_without_approved_report/,'Revisión de informes');
assert.match(viewer,/past_pending|stale_pending/,'Revisión de turnos pendientes vencidos');
assert.match(viewer,/credentials:'omit'/,'La plantilla se lee sin reutilizar sesión institucional');
assert.match(viewer,/Vista de referencia · Solo lectura/,'No aparenta una sesión real');
assert.doesNotMatch(viewer,/auth\.signInWithPassword\(|auth\.updateUser\(|\.rpc\('aerosuite_booking_action'|\.rpc\('aerosuite_finance_action'/,
 'El visor no cambia claves ni ejecuta acciones de reservas o dinero');
assert.match(viewer,/No es una sesión del usuario/,'No se presenta como suplantación');
const previewScripts=[...viewer.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(previewScripts.length,1,'Un único script de visor');
new vm.Script(previewScripts[0][1],{filename:'superadmin-visor-roles.html'});

for(const [name,html] of [['ingreso-escuela.html',admission],['portal-escuela.html',school]]){
 const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,name+': un único controlador local');
 new vm.Script(scripts[0][1],{filename:name});
 assert.doesNotMatch(html,/service_role|SUPABASE_SERVICE_ROLE_KEY/,'No exponer clave privilegiada');
}

// Secretaría opcional: mismos módulos económicos que Dirección, alta/baja del rol reservada al Director.
assert.match(admission,/secretaria:'secretaria'/,'El enlace institucional reconoce a Secretaría');
assert.match(school,/id="secretaryInviteOption" hidden/,'Solo se muestra la opción Secretaría cuando corresponde');
assert.match(school,/el\('secretaryInviteOption'\)\.hidden=!isDirector/,'El Director controla el alta de Secretaría');
assert.match(school,/person\.role!=='secretaria'\|\|isDirector/,'Secretaría no puede desvincular Secretaría');
assert.match(emailSender,/role==="secretaria"\|\|!isSuper/,'La invitación de Secretaría requiere autorización institucional específica');
assert.match(emailSender,/role==="secretaria"\?\["administrador"\]:\["administrador","secretaria"\]/,'Solo Dirección invita Secretaría; ambos administran el resto del personal');
assert.match(emailSender,/secretaria:"secretaría"/,'La notificación identifica el rol Secretaría');

console.log('PASS: ingreso de director separado del Superadministrador, permisos verificados y módulos bloqueados');
