# Caja de Ideas de AeroSuite — Documento Maestro

**Actualizado:** 28/10/2026  ·  **Proyecto:** AeroSuite, By Gente de Vuelo

Este es el registro central de las decisiones, ideas y pendientes tratados para AeroSuite. No implica que todos los módulos estén publicados o habilitados.

## 0. Criterio de mantenimiento de la caja

- **Corte consolidado: 25 de octubre de 2026.** Registro del proyecto AeroSuite · By Gente de Vuelo. Mantener aquí las decisiones, ideas, referencias y pendientes con etiquetas: APROBADO / PROVISIONAL / IMPLEMENTADO EN CÓDIGO / PENDIENTE / REFERENCIA EXTERNA.

- Una funcionalidad codificada no debe considerarse publicada sin despliegue exitoso y prueba de usuario. Algunos despliegues de octubre fueron bloqueados por límites de Vercel. No confundir demo de administrador con cuentas institucionales reales.

- El anexo [Comercialización, tarifas y período de prueba](IDEAS-seguimiento-aeronaves.md) es la fuente detallada del esquema de precios provisional.

## 0B. Acceso de clientes y Superadministración — 26/10/2026

- **APROBADO:** usar inicialmente el subdominio `aerosuite.gentedevuelo.com` para el acceso directo de clientes, sin comprar otro dominio. Gente de Vuelo mantiene el acceso de presentación comercial. **PENDIENTE:** configurar DNS, Vercel, URLs autorizadas de Supabase Auth y probar el acceso real al subdominio.
- **IMPLEMENTADO EN SUPABASE:** rol separado `aerosuite_superadmins`, inicialmente asignado a la cuenta administradora actual de Gente de Vuelo; catálogo `aerosuite_institutions`; usuarios asociados `aerosuite_institution_members` y auditoría `aerosuite_institution_audit`, todos con RLS. Las mutaciones comerciales quedan restringidas al Superadministrador.
- **IMPLEMENTADO EN CÓDIGO:** `superadministrador.html` gestiona altas y edición de instituciones, tipo, datos de contacto, plan, prueba de 30 días, vencimiento y suspensión. Desde Utilidades se muestra una tarjeta exclusiva para el rol. **VERIFICADO (26/10):** el acceso a Superadministración desde la presentación fue probado por el administrador. La nueva simulación de invitaciones requiere prueba de navegación tras desplegarse.
- **DECISIÓN DE SEGURIDAD:** no entregar contraseñas generales a escuelas ni confundir la autodeclaración de instructor/piloto con autorización institucional. No eliminar registros al suspender. Los estados pendientes, vencidos y suspendidos no concederán acceso comercial.
- **PRUEBA REAL INSTITUCIONAL CREADA (26/10):** se registró en Supabase una escuela ficticia `Escuela de Vuelo Horizonte (PRUEBA REAL)` con plan institucional y prueba de 30 días (hasta 25/11/2026, según hora de alta). Se registró una invitación de director vinculada a la dirección personal aportada para la prueba, con vencimiento en siete días. La cuenta del Superadministrador sigue separada. **No se ha enviado correo automático** ni se ha asociado aún un usuario como director: la aceptación debe realizarla personalmente la cuenta invitada y verificada. No publicar el correo personal en el repositorio público.
- **IMPLEMENTADO EN SUPABASE:** tabla `aerosuite_institution_invitations` con RLS y aceptación autenticada mediante `aerosuite_accept_my_invitation(p_institution_id)`; verifica la identidad, correo confirmado, coincidencia exacta con invitación, fecha de expiración y licencia vigente antes de vincular el usuario en `aerosuite_institution_members`. `aerosuite_my_institution_access()` solo devuelve las instituciones asociadas a la persona autenticada, con datos institucionales mínimos. El rol Superadministrador **no** concede automáticamente el rol de director.
- **IMPLEMENTADO EN CÓDIGO:** `ingreso-escuela.html` permite ingreso con cuenta personal existente y aceptación expresa de invitación; `portal-escuela.html` muestra solo el estado institucional verificado. Los cuatro accesos a reservas, alumnos, flota y academia quedan inactivos hasta disponer de separación de datos y permisos operativos por institución. El Superadministrador tiene enlace «Probar ingreso» en la lista de instituciones. **PENDIENTE DE PRUEBA REAL DE USUARIO:** autenticación con correo personal y aceptación. Para conservar abierta la sesión de Superadministrador, probar en incógnito.
- **IMPLEMENTADO EN CÓDIGO — CAMINO DEMO (26/10):** desde `superadministrador.html` se accede a `demo-autorizacion.html`, simulador interactivo exclusivo del Superadministrador con cinco pantallas: (1) alta ficticia, (2) autorización simulada de 30 días, (3) vista previa de correo de invitación, (4) activación ficticia del responsable y (5) maqueta del portal de esa institución. No se envía ningún correo, no se crean usuarios ni escuelas, no se guardan datos, no se activa una licencia. Se distingue expresamente demostración de producción.
- **PENDIENTE:** invitaciones institucionales verificadas, administrador designado, inicio de sesión directo por subdominio, control de acceso efectivo en módulos de alumno/instructor/gestión y aislamiento de sus datos por institución. No hay ninguna escuela habilitada; el portal actual sigue como demo privada.
- **PROVISIONAL:** los planes visibles en el panel son etiquetas internas; no crean cargos automáticos, facturación ni pasarela de pago. El esquema provisional Airnizer de la sección 2 no se modifica.

## 0C. Alta con correo e ingreso institucional — 26/10/2026

- **APROBADO COMO FLUJO:** el Superadministrador registra y habilita una institución y envía una invitación por correo al director/responsable. La institución tiene su propio acceso privado. Luego el director podrá cursar invitaciones separadas por rol a **instructores** y **alumnos**. El correo debe abrir directamente la pantalla de AeroSuite, sin navegar antes por la portada de Gente de Vuelo.
- **REGLA DE SEGURIDAD:** el DNI **no** se utiliza como clave inicial o provisoria porque es predecible y un dato personal. El destinatario elige su contraseña al registrarse; si ya tiene cuenta con ese correo, conserva la contraseña vigente. El sistema verifica por Supabase Auth la titularidad del correo y exige una invitación vigente antes de asignar el rol. Ni el director ni los instructores pueden asignarse privilegios de Superadministrador.
- **IMPLEMENTADO EN CÓDIGO (PENDIENTE DE PRUEBA END-TO-END):** el Superadministrador muestra «Enviar invitación al director» junto a la escuela. La Edge Function `aerosuite-invitations` está desplegada con verificación JWT, permisos por rol/institución, validación de licencia y envío vía Resend, sin exponer claves del proveedor. Las invitaciones se registran y muestran estado de correo aceptado por proveedor o aún no enviado. Desde `portal-escuela.html`, un director de institución vigente puede elegir expresamente entre **Instructor** y **Alumno** y solicitar el envío de sus correos.
- **IMPLEMENTADO EN FRONTEND:** `ingreso-escuela.html` ahora tiene correo/contraseña, creación directa de cuenta AeroSuite, recuperación de clave y aceptación de invitación; `portal-escuela.html` muestra la institución/rol y, solo al director, el formulario de altas. El enlace del correo actualmente usa `gentedevuelo.com/utilidades/gestion-aeronautica/ingreso-escuela.html` (pantalla AeroSuite) hasta configurar `aerosuite.gentedevuelo.com`.
- **PENDIENTE:** probar con sesión real de director y correo recibido; comprobar confirmación/cambio de contraseña desde las URL de retorno permitidas de Supabase Auth, configuración/verificación del remitente Resend y recepción real del correo. No suponer que el envío está confirmado solo porque la Edge Function fue desplegada. Los módulos funcionales para escuelas siguen inactivos hasta implementar RLS por institución.

### Correcciones en Superadministración — 27/10/2026

- **IMPLEMENTADO:** opción **Eliminar institución** para cada institución registrada. Exige escribir exactamente su nombre y confirmar por segunda vez. Solo el rol `aerosuite_superadmins` puede ejecutar la función `aerosuite_delete_institution`. Elimina los datos del catálogo, invitaciones, asignaciones y auditoría institucional de forma transaccional, pero NO elimina las cuentas personales de Supabase Auth. Guarda un asiento mínimo de eliminación en esquema privado. Si aparecen otras dependencias operativas, la eliminación se bloquea sin dejar registros parcialmente borrados.
- **DIAGNÓSTICO CORREO:** la primera invitación del director permanecía con `sent_count=0` y `last_sent_at=NULL`. Logs de Supabase de la función `aerosuite-invitations` registraban un **404** al intentar el envío, debido a permisos SELECT/INSERT/UPDATE faltantes para `service_role` sobre las nuevas tablas institucionales. Se otorgaron permisos precisos a `service_role`, verificando visibilidad real de la institución desde ese rol. **PENDIENTE:** reenviar desde el panel por acción expresa del Superadministrador y confirmar recepción en correo personal; no se efectuó envío automático de prueba.
- **MEJORA UI:** errores de Supabase Edge Function visibles en el listado de instituciones, evitando el falso positivo de «correo enviado»; estado textual distingue invitación creada de envío aceptado por proveedor.

### Corrección del flujo de invitación y roles — 27/10/2026

- **PRUEBA DE USUARIO:** emails de director, instructor y alumno sí llegaron, pero el texto no describía el alta de cuenta. La pantalla de acceso mostraba datos/autocompletado del Superadministrador, obligaba a volver a ingresar tras el registro y produjo `Invalid login credentials`. No se había logrado probar el aislamiento visual entre roles.
- **CORREGIDO EN FRONTEND:** `ingreso-escuela.html` presenta primero el formulario **Crear tu cuenta AeroSuite**, con correo y contraseñas vacíos, `autocomplete=off`, entradas de contraseña `readonly` hasta interacción, y almacenamiento Supabase Auth exclusivo `storageKey: 'aerosuite-institucional-v2-auth'`. `portal-escuela.html` utiliza la misma clave independiente de la sesión Gente de Vuelo/Superadministrador. Quienes ya tienen cuenta deben usar su contraseña existente o recuperar acceso; no se sobrescriben claves de cuentas previas.
- **ACTIVACIÓN DIRECTA:** tras confirmar el correo y cuando Supabase completa el inicio de sesión en el enlace de confirmación, AeroSuite valida invitación y licencia y redirige automáticamente al portal institucional. Si el correo no está confirmado, exige verificarlo. Un alta sobre un correo que ya existe puede ocultar este hecho según las reglas de Supabase Auth; el formulario muestra una explicación.
- **CORREGIDO EN EMAIL:** mensaje `Fuiste invitado para crear una cuenta en AeroSuite de Gente de Vuelo como [administrador/instructor/alumno] de [institución]` y link de ingreso directo a la pantalla de AeroSuite, con `rol` y `institucion`.
- **PERMISOS:** nueva función `aerosuite_accept_invitation_role(p_institution_id,p_role)` acepta únicamente la invitación vigente del correo verificado, institución y **rol exactos**, con chequeo de licencia. Comprobado en transacción con ROLLBACK que un instructor no se activa como alumno ni puede consultar otra institución. `portal-escuela.html` muestra tarjetas diferentes para los tres roles; solo el administrador puede invitar personal, con módulos operativos aún bloqueados.
- **ESTADO / PENDIENTES:** Vercel y Edge Function desplegados; faltan pruebas de interfaz reales por cuentas invitadas y validar la lista de Redirect URLs de Supabase Auth para retorno a AeroSuite tras la verificación. En la inspección de la base en esta fecha no había instituciones ni invitaciones activas; recrear una escuela de prueba antes de probar el circuito nuevamente. Ninguna contraseña del Superadministrador se modifica.

### Habilitación de escuelas pendientes + invitación — 27/10/2026

- **MEJORA APLICADA:** cuando el Superadministrador registra una institución con estado **Pendiente de habilitación**, la tarjeta muestra **«Habilitar 30 días y enviar invitación»**, sin obligarlo a ingresar a «Gestionar», cambiar estado y guardar por separado. Requiere una única confirmación con nombre de institución y correo del director.
- **OPERACIÓN:** tras confirmar, actualiza **solo** una institución todavía pendiente que no haya iniciado una prueba (filtros por `id`, `status='pending'` y `trial_started_at IS NULL`). El trigger de Supabase genera las fechas de 30 días; recién tras verificar que la licencia se activó se solicita el correo al director mediante la función existente `aerosuite-invitations`.
- **FALLOS:** si el correo falla luego de habilitar la prueba, la ficha queda en **Prueba** y muestra **«Enviar invitación al director»** para reintentar sin reiniciar los 30 días. Se informa por separado qué acción se completó y qué acción falló. Sin envío automático mientras no haya clic de confirmación.
- **ESTADO AL VERIFICAR:** durante esta revisión la escuela temporal `aero moron` dejó de figurar en la lista de instituciones (hay un asiento de eliminación en el historial); el botón quedará disponible al registrar una nueva institución pendiente. No se recreó una escuela en nombre del usuario.

### Planes comerciales definitivos — 27/10/2026

- **DECISIÓN CONFIRMADA:** AeroSuite se comercializará con **solo dos planes: Essential y Pro**, aplicables a escuelas de vuelo, aeroclubes y aeródromos. No ofrecer en nuevas altas `Sin asignar`, `Institucional` ni `AeroClub Pro` como planes diferenciados.
- **IMPLEMENTADO EN SISTEMA:** el campo `plan` de `aerosuite_institutions` acepta únicamente `essential` y `pro`, con `essential` como valor predeterminado; el Superadministrador y el camino demo muestran solo estas dos opciones y el portal de clientes presenta los nombres comerciales correctamente.
- **PRUEBA DE 30 DÍAS:** no es un tercer plan sino un **estado de licencia** disponible para cualquiera de los dos planes. No hay conversión automática a pago.
- **PENDIENTE DE DEFINIR:** beneficios y precios definitivos de Essential y Pro; los modelos de costos preliminares no se toman como tarifa aprobada y no se modificaron en esta decisión.

### Alta institucional directamente en prueba gratuita — 27/10/2026

- **DECISIÓN APROBADA:** cualquier escuela de vuelo, aeroclub o aeródromo nuevo entra **siempre** con **30 días de prueba gratuita** desde el momento del alta. El estado intermedio «Pendiente de habilitación» se elimina por innecesario. No es un tercer plan: la institución se registra con el plan comercial **Essential** o **Pro**.
- **IMPLEMENTADO EN SUPERADMINISTRACIÓN:** el formulario de alta ya no permite elegir el estado; explica que la prueba comienza automáticamente y guarda `status='trial'`. La institución aparece inmediatamente como **Prueba** con vencimiento. En su propia tarjeta se pulsa **«Enviar invitación al director»**; el correo no se dispara automáticamente sin confirmación.
- **IMPLEMENTADO EN SUPABASE:** valor predeterminado de `status` = `trial`. El trigger fuerza `trial` en toda creación y calcula `trial_started_at` y `trial_ends_at` exactamente a 30 días, aunque un cliente antiguo intente insertar `pending` o `active`. La restricción SQL elimina el estado `pending` en las actualizaciones. Las fechas originales de prueba son inmutables tras el alta, de manera que ni la suspensión ni una edición reinician el mes gratuito.
- **GESTIÓN POSTERIOR:** solo el Superadministrador puede editar el estado de una institución existente para dejarla en prueba, activar licencia de pago con vencimiento, suspenderla o marcarla vencida. La licencia no se convierte automáticamente en paga. Si el correo de invitación no llega, se reintenta desde la tarjeta sin cambiar la prueba.
- **VERIFICACIÓN:** comprobación transaccional en Supabase (ROLLBACK): alta enviada como `pending` fue registrada como `trial` de 30 días; se bloqueó modificar fechas o volver al estado pendiente, y suspender no prorrogó la prueba. No se generaron instituciones de ensayo permanentes.

### Continuidad tras la prueba gratis — decisión aprobada 27/10/2026

- **APROBADO:** 30 días iniciales gratis de Essential o Pro, **15 días adicionales de cortesía con acceso operativo completo** (días 31–45), y **desde el día 46 modo consulta** si el cliente no contrata. No hay eliminación automática de registros, ni bloqueo total por haber finalizado la prueba. La consulta conserva la información ya registrada; las operaciones nuevas, invitaciones y modificaciones de información quedan deshabilitadas. La exportación de datos será parte del modo consulta cuando se integren los módulos reales.
- **COMUNICACIÓN APROBADA, PENDIENTE DE AUTOMATIZAR:** avisos de vencimiento al director en los días 20 y 27, con precio y opción de contratación. Una vez finalizados los 30 días, avisar sobre los 15 de cortesía y el posterior modo consulta. No afirmar que los correos están programados o se envían si todavía no existe el proceso.
- **CONTRATACIÓN:** el cliente decide expresamente entre Essential o Pro antes/durante/después de la cortesía. Si acepta una licencia mensual, puede continuar o recuperar operaciones sin perder datos; el cobro recurrente solo se habilitará con su autorización y un medio de pago integrado. **NO IMPLEMENTADO AÚN:** pasarela, facturación, autorización de cobro, renovaciones automáticas y recordatorios de pagos. No generar deuda ni cobrar por finalizar la prueba.
- **IMPLEMENTACIÓN EN SUPABASE:** función `private.aerosuite_access_mode(status, trial_end, license_end, as_of)` con cuatro modos: `trial` hasta día 30, `grace` hasta día 45, `read_only` luego, `active` con licencia vigente, y `blocked` en estados suspendidos/vencidos. Nueva RPC de lectura autenticada `aerosuite_my_institution_access_v2()` devuelve `can_access`, `can_write`, `access_mode` y `grace_ends_at` con instituciones y rol del usuario; solo el período operativo concede invitaciones y se valida también en las funciones SQL y Edge Function. La excepción de consulta no habilita cambios en ningún módulo.
- **IMPLEMENTACIÓN FRONTEND:** `ingreso-escuela.html` y `portal-escuela.html` usan RPC v2; el portal presenta claramente prueba, cortesía o modo consulta, conserva el acceso de lectura y oculta las invitaciones en solo consulta. `superadministrador.html` distingue los estados, muestra vencimientos del mes gratuito y de la cortesía, y no trata el día 31 como un bloqueo.
- **LIMITACIÓN IMPORTANTE:** los módulos operativos reales, su exportación y sus respectivas políticas RLS por institución aún están pendientes; no considerar esta decisión implementada para operaciones que todavía no están conectadas a la RPC v2. Las pruebas SQL de límites día 30/día 45 validaron los modos del nuevo control.

### Alta directa sin repetir usuario ni contraseña — 27/10/2026

- **INCIDENTE REPORTADO:** tras recibir el mail de invitación y crear una contraseña, el director no ingresó automáticamente al portal; al intentar un segundo ingreso con usuario/contraseña no pudo acceder. El usuario solicitó botones de ojo para ver lo escrito en las claves.
- **DIAGNÓSTICO VERIFICADO EN SUPABASE:** al revisar las nuevas cuentas en `auth.users` existía una cuenta recién registrada con `email_confirmed_at IS NULL`. Con la confirmación de correo activada en el proyecto, **Supabase no permite iniciar sesión con contraseña hasta verificar el correo**. No se desactiva esa protección (Auth es compartido por AeroSuite y Gente de Vuelo).
- **IMPLEMENTADO:** `ingreso-escuela.html` muestra un botón con **ojito Mostrar/Ocultar** para contraseña de ingreso, nueva, repetición y recuperación. Después de `auth.signUp`, si Supabase no emite una sesión, se muestra una pantalla separada «Verificá tu correo»: la contraseña **ya está creada**, falta abrir un **segundo correo de confirmación de Supabase**. Incluye **Reenviar confirmación** usando `auth.resend({type:'signup',email,options:{emailRedirectTo:activationUrl}})` y acceso a esta pantalla desde ingreso y registro. Cuando la confirmación válida devuelve una sesión, la aplicación intenta aceptar la invitación y abrir el portal de la institución y rol automáticamente, sin ingresar otra vez usuario/contraseña.
- **SEGURIDAD:** no almacenar contraseñas en URLs, localStorage adicional ni registros; no modificar cuentas ya existentes ni forzar verificación sin comprobante de correo. Se mantiene sesión independiente del Superadministrador.
- **VALIDACIÓN PENDIENTE:** probar con confirmación real que el correo de Supabase redirija a `https://gentedevuelo.com/utilidades/gestion-aeronautica/ingreso-escuela.html?institucion=…&rol=…`. En **Supabase Auth → URL Configuration → Redirect URLs**, agregar una regla que cubra la ruta y parámetros de invitaciones de AeroSuite si no se encuentra autorizada. La configuración del servidor de correo de Auth debe permitir entregar el segundo mensaje. Esta validación no se puede sustituir por pruebas estáticas del código.

### Alta en un solo correo para todos los roles — 27/10/2026

- **NUEVA DECISIÓN DEL USUARIO:** la recepción de la invitación ya demuestra que el destinatario controla la dirección de correo. Por tanto, después de abrir el enlace, **no se exigirá un segundo correo** para verificar la cuenta: el invitado debe crear su contraseña e ingresar directamente a su portal. **Exactamente el mismo circuito** para director/administrador, instructor y alumno. El botón de ojito continúa disponible.
- **IMPLEMENTACIÓN DE VERIFICACIÓN SEGURA:** la Edge Function `aerosuite-invitations` genera con Supabase Auth `auth.admin.generateLink({type:'magiclink',email})` un **token de verificación de un solo uso**. Lo incluye en el fragmento `#token_hash=...&type=magiclink` del enlace personal enviado por Resend (fragmento no se remite en la petición HTTP a Vercel). El enlace anterior `?institucion=...&rol=...` sin token solo identificaba la institución y no verificaba la dirección: no era suficiente para dar de alta y exigía una confirmación adicional.
- **IMPLEMENTACIÓN EN PANTALLA:** `ingreso-escuela.html` procesa el enlace mediante `supabase.auth.verifyOtp({token_hash,type:'magiclink'})`, retira el fragmento de la barra de dirección y muestra **Crear contraseña**, solo con los campos de contraseña y repetición. Guarda con `supabase.auth.updateUser({password})`, luego verifica la invitación y licencia institucional por RPC y abre el portal del rol apropiado sin un segundo ingreso. Para cuentas existentes hay una opción explícita de conservar su contraseña actual; no se cambia silenciosamente. Los campos tienen ojito y protección contra autocompletado.
- **MISMO FLUJO EN TRES ROLES:** el correo personalizado y la pantalla de contraseña sirven a `administrador`, `instructor` y `alumno`. El rol y la institución deben coincidir exactamente con la invitación vigente en Supabase. El director puede invitar alumnos/instructores de **su propia institución**; no se heredan privilegios de Superadministrador. Los módulos operativos de cada rol continúan pendientes de integración con RLS institucional.
- **SEGURIDAD / VIGENCIA:** el enlace de Auth es de **un solo uso** y caduca según la configuración de Supabase (puede caducar antes que la invitación administrativa de 7 días). Los enlaces viejos sin token no disfrutan del alta directa. El password no se transporta en URLs ni en los correos. Si el enlace fue utilizado/venció, se solicitará reenviar una nueva invitación; no se deshabilitó la verificación de correo en el proyecto compartido de Gente de Vuelo.
- **ESTADO DE VERIFICACIÓN:** Edge Function desplegada con `verify_jwt=true`, frontend y pruebas estáticas actualizadas. **Pendiente:** prueba de punta a punta con un enlace real recibido por administrador, instructor y alumno; comprobar consumo de token, creación de contraseña, sesión activa, asignación de rol y aislamiento de datos por institución. No declarar el flujo validado con clientes hasta completar esa prueba.

### Ajuste de onboarding y gestión del personal institucional — 27/10/2026

- **DECISIÓN DEL USUARIO:** para `administrador`, `instructor` y `alumno` el mismo circuito de invitación personal de un solo uso, seguido de creación de contraseña y apertura directa del portal, sin segundo correo de verificación. Los instructores y alumnos **NO** deben ver plan Essential/Pro, fecha de finalización de la prueba, plazo gratuito ni avisos de cobro; la información comercial queda **solo para el director**.
- **INCIDENTE OBSERVADO:** una invitación de instructor fue recibida y aceptada, pero el usuario reportó que, después de crear la cuenta, la interfaz volvió a pedir confirmar el correo. En Supabase, la invitación del instructor figuraba aceptada y su cuenta con correo confirmado. **MEDIDA:** la pantalla de ingreso sin un token personal ya no ofrece como paso predeterminado el registro clásico que dispara un segundo correo; muestra «Necesito una invitación nueva» y pide renovar el enlace seguro. Los enlaces actuales con `#token_hash` verifican en la misma invitación y pasan a `updateUser({password})` y `aerosuite_accept_invitation_role`. El instructor que ya tiene su cuenta puede entrar con la contraseña existente. Se mantienen los ojos de mostrar/ocultar clave.
- **PORTAL DEL PERSONAL:** ocultar por completo `schoolPlan`, `schoolExpiry`, `schoolAccessLine` y `subscriptionNotice` cuando `my_role` es `instructor` o `alumno`. Conservan nombre de la institución, identidad personal y las tarjetas exclusivas de su rol. En modo consulta se informa de forma operativa que el acceso es de lectura sin detallar arancel o vencimientos.
- **GESTIÓN DEL DIRECTOR IMPLEMENTADA:** nuevo panel «Instructores y alumnos de mi escuela» enumera vinculados y las invitaciones sin aceptar. Botones **Desvincular** y **Cancelar invitación**, con una única confirmación. La cuenta Supabase Auth **no se borra**, ni se afecta su pertenencia a otras instituciones. La baja revoca los registros de invitación de esa persona/rol para impedir activarlos otra vez, pero mantiene el historial auditado.
- **SEGURIDAD:** RPC `aerosuite_director_people(p_institution_id)` y `aerosuite_director_remove_person(p_institution_id,p_person_id,p_kind)` son `SECURITY DEFINER`, expuestas solo a `authenticated` y autorizadas internamente exclusivamente al director miembro `role='administrador'` de **esa institución**. Ninguna baja puede apuntar a otro director ni a personas de otra escuela; el backend bloquea bajas con el servicio sin licencia operativa. La tabla de auditoría admite `MEMBER_UNLINK` y `INVITATION_REVOKE`. En la Edge Function de invitaciones se permite invitar de nuevo a una persona desvinculada filtrando invitaciones aceptadas previamente revocadas.
- **VERIFICACIÓN:** pruebas SQL transaccionales con ROLLBACK comprobaron que el director ve su nómina, revoca invitaciones pendientes, desvincula instructores y no modifica otras escuelas; que no puede desvincular a un administrador y que un instructor no puede listar la nómina. Ninguna persona real fue dada de baja durante las pruebas.
- **PENDIENTE:** prueba real del nuevo enlace de instructor y alumno, con el navegador actualizado, y comprobar que el director ve la nómina y botones. La aplicación no crea todavía reservas/formación institucionales reales: faltan RLS por escuela en módulos operativos.

### Superadministrador: conteo y gestión de cuentas por escuela — 27/10/2026

- **APROBADO:** el Superadministrador debe ver, **por institución y en total**, cuántos instructores y alumnos **ya crearon/activaron su vínculo con AeroSuite** y cuántas invitaciones siguen pendientes. Poder listar por rol, correo y fecha de alta, y desvincular instructores/alumnos o revocar invitaciones directamente si el director no puede hacerlo. El director mantiene esta misma facultad de gestión únicamente respecto de su escuela.
- **IMPLEMENTACIÓN BACKEND:** RPC `aerosuite_superadmin_staff_counts()` devuelve totales por institución de membresías activas (`instructor`, `alumno`) e invitaciones todavía no aceptadas/revocadas/no vencidas; solo se ejecuta si `auth.uid()` existe en `aerosuite_superadmins`. La RPC existente `aerosuite_director_people(institution_id)` ahora autoriza al director de su propia institución **o** al Superadministrador; otro instructor/alumno o director de otra escuela no pueden consultarla.
- **BAJAS SEGURAS:** nueva RPC `aerosuite_manage_staff_remove(institution_id,person_id,kind,role)`, disponible solamente para un director de la institución con licencia operativa o para el Superadministrador (este último puede actuar aunque la escuela esté suspendida o en modo consulta). Exige rol exacto `instructor`/`alumno` y escuela concreta; no permite quitar directores, ni afectar otra institución, ni eliminar `auth.users`. Cancela las invitaciones ligadas al rol/email; registra en auditoría `MEMBER_UNLINK` o `INVITATION_REVOKE` con identidad de quien realizó el cambio.
- **SUPERADMINISTRACIÓN UI:** por cada tarjeta institucional se muestran los totales de instructores/alumnos activos y las invitaciones pendientes por rol; la cabecera incorpora los totales globales. Botón **«Gestionar cuentas»** despliega el listado de esa escuela y las acciones **Desvincular** / **Cancelar invitación**, ambas con confirmación. Si la baja se concreta, las cantidades se recalculan desde Supabase. El panel del director invoca la misma RPC segura e indica el rol exacto.
- **VERIFICACIONES:** control de lectura exclusivo del Superadministrador en contadores, rechazo de instrucciones/lecturas por instructor, prohibición de que un director modifique otra escuela o se elimine como director, y alta capacidad de baja excepcional del Superadministrador aun con institución suspendida. SQL probado dentro de transacciones `BEGIN/ROLLBACK` sin retirar personal real. **La prueba manual desde la interfaz sigue pendiente.**
- **NOTA DE MODELO:** los recuentos representan **membresías institucionales**, no necesariamente cuentas nuevas de Auth; una persona puede estar asignada a distintas instituciones o a roles distintos, por lo que se cuenta por vínculo de institución y rol. Las invitaciones enviadas, aceptadas, vencidas, revocadas y las cuentas suspendidas deben distinguirse cuidadosamente.

### Simplificación de tarjetas en Superadministrador — 27/10/2026

- **DECISIÓN DEL USUARIO:** quitar de cada tarjeta los botones grandes **«Gestionar»** y **«Probar ingreso»** por redundantes.
- **CAMBIO EN CÓDIGO:** las acciones principales por institución son **«Gestionar cuentas»**, **«Enviar invitación al director»** cuando corresponde y **«Eliminar institución»**. Para conservar la administración de nombre, plan y licencia sin ocupar otro botón grande, se deja un **lápiz discreto junto al nombre de la escuela**, que abre el formulario de edición existente.
- **VALIDACIÓN:** pruebas estáticas comprueban la ausencia de las dos acciones anteriores, la conservación del formulario de edición y la gestión de instructores/alumnos. La publicación pública depende del próximo despliegue exitoso de Vercel; si persiste el límite de compilaciones, no se debe afirmar que ya aparece visible.

## 1. Visión, marca e integración con Gente de Vuelo

- **APROBADO:** el nombre del producto es **AeroSuite** con firma **By Gente de Vuelo**. Su identidad: A aerodinámica, colores azul aeronáutico/plata, base azul oscuro, estilo moderno y premium. Verificación legal de marca/dominio pendiente.

- **APROBADO:** AeroSuite es una extensión integral de la comunidad Gente de Vuelo, dirigida a escuelas de vuelo, aeroclubes, alumnos, instructores y pilotos. Sencillez de uso, resultados útiles, seguridad y datos aeronáuticos confiables.

- **APROBADO:** una única cuenta de Gente de Vuelo para registrarse en AeroSuite; la participación comercial de una escuela no debe convertir en pagado el acceso básico a la comunidad.

- **APROBADO:** tres áreas diferenciadas: Formación del Alumno, Instrucción/Jefatura y Gestión Administrativa, con módulos compartidos y permisos separados.

- **APROBADO:** la portada Gente de Vuelo lleva a la **pantalla de presentación de AeroSuite**, y el botón de esta lleva a la **demo del portal**. Desde presentación y portal se puede volver al Inicio de Gente de Vuelo. Demo operativa solo admin por ahora.

- **DISEÑO:** foto de aeronave claramente apoyada en la pista, texto de portada situado arriba sin taparla. Paleta azul, gris carbón, plata y dorado moderado. Afiche vertical 9:16 que anuncie «PRÓXIMAMENTE», AeroSuite y las áreas Formación/Instrucción/Gestión.

## 2. Comercialización — decisión actual

- **APROBADO COMO TARIFARIO PROVISIONAL (25/10/2026):** adoptar **por ahora la estructura e importes aportados de Airnizer** como esquema de comercialización de AeroSuite, sujetos a revisiones posteriores. No son cobros efectivamente activados.

- **Plan para escuela/aeroclub:** Módulo Empresa **ARS 60.000/mes** (fijo) + **ARS 10.500/mes por aeronave afectada** + **ARS 3.650/mes por usuario afectado**. Confirmar antes de facturar criterios de usuarios, vehículos incluidos, impuestos, titularidad y bonificaciones.

- **Seguimiento individual separado:** **1 aeronave gratis** para el piloto/propietario particular; **desde la segunda ARS 10.500/mes por aeronave adicional**. Verificar si el beneficio de una aeronave gratis aplica también al paquete institucional: **NO asumir que los dos esquemas se acumulan**.

- **APROBADO:** cada escuela dispondrá de **un mes de prueba gratuito**, sin tarjeta de crédito obligatoria y sin transformación/cobro automático al vencer. Avisos sugeridos a 7 y 2 días; contratar voluntariamente al concluir; conservación y exportación de registros, sin borrado inmediato.

- **PENDIENTE:** definir si un mes equivale a mes calendario o 30 días; calendario de activación, límites de prueba, funciones costosas de IA, actualización de aranceles, Essential/Pro, descuentos por institución, condiciones de cobro y post-vencimiento.

- **A EXPLORAR:** edición **Free Community** autohospedada sin costo para escuela/aeroclub que administre su infraestructura; opciones Essential/Pro en nube. Licencia gratuita no significa automáticamente código abierto. Estos planes futuros no sustituyen el tarifario provisional sin nueva decisión.

- **PENDIENTE FISCAL:** alta y actividad ante ARCA (ex AFIP), CUIT, Monotributo o Régimen General según situación, comprobantes electrónicos y tributos provinciales (p. ej. ARBA/Convenio Multilateral). Pasarela de pago, impuestos, términos de servicio, privacidad y suscripciones todavía no implementados.

- **REFERENCIA COMPETITIVA:** los precios fueron aportados por el usuario a través de capturas/explicaciones de Airnizer; no están verificados como cotización oficial vigente. Más detalles en el anexo comercial.

## 3. Investigación, encuestas y análisis de competencia

- **EN CURSO:** recolectar y analizar encuestas a escuelas y aeroclubes (incluidas respuestas de Ensenada y otras instituciones aportadas por usuario). Comparar número de alumnos, flota, administración, reservas, operaciones y necesidades reales.

- **PENDIENTE:** análisis FODA y matriz funcional de competidores, especialmente Airnizer, Aeros Gestión y plataformas similares; contrastar tarifas, flujos, soporte y carencias antes de posicionar comercialmente AeroSuite.

- **IDEA:** diferenciarse por experiencia simple, conexión con comunidad aeronáutica, formación original, planificación meteorológica, seguimiento académico, mantenimiento y operación unificados.

- **A EVALUAR:** modelos de costo para escuelas pequeñas, medianas y grandes; comparar cargas por aeronave y por usuario, evitando desincentivar el registro de alumnos.

## 3B. Estudio competitivo: GestiónAero y Aeros Gestión — 25/10/2026

- **ESTUDIADO EN FUENTES PÚBLICAS:** **GestiónAero** ([gestionaero.com.ar](https://gestionaero.com.ar/)) comunica reservas y validación de habilitaciones, vuelo→horas→RAV PDF, gestión de flota/mantenimiento, socios, contabilidad, combustible, avisos y reservas de instalaciones; administra varias instituciones. Las prestaciones fueron observadas en su sitio comercial, **no verificadas dentro de una cuenta operativa**.
- **HALLAZGO PRIORITARIO DE PRECIOS:** GestiónAero publica prueba de **30 días gratis sin tarjeta**, **Full ARS 60.000/mes + IVA con usuarios y aeronaves ilimitados** y **WhatsApp ARS 80.000/mes + IVA**. El esquema provisional adoptado para AeroSuite es **ARS 60.000 base + ARS 10.500 por aeronave + ARS 3.650 por usuario**, que puede resultar sustancialmente más caro. **No modificar la decisión vigente de precios sin nueva aprobación**, pero priorizar una simulación comercial para escuelas pequeñas/medianas.
- **OTRO PROVEEDOR DISTINTO:** **Aeros Gestión** ([aeros.com.ar/web/](https://aeros.com.ar/web/)) anuncia reservas, contabilidad, factura electrónica, mecánica, vencimientos, biblioteca aeronáutica, servicios METAR/NOTAM/LAD, IA, formación Aeros SED y beneficio **Aeros Base gratis únicamente para socios FADA habilitados**. Precios generales no confirmados.
- **PENDIENTE DE EVALUACIÓN:** solicitar demo autorizada, recorrer alta → reserva → vuelo → RAV → cuenta corriente y comprobar controles de vencimientos, accesos, auditoría, exportación y soporte. Valorar tarifa plana frente a variable, y ventaja diferenciadora de AeroSuite con comunidad+Academia+Flight Operations+AeroLocator.
- **FUENTE Y ANÁLISIS DETALLADO:** [Estudio GestiónAero y Aeros Gestión](ANALISIS-COMPETENCIA-GESTIONAERO-AEROS.md). Los precios son los publicados el **25/10/2026**, sujetos a cambios del proveedor.

## 4. Registro integrado, documentación y roles

- **APROBADO:** quien se registra en Gente de Vuelo puede ampliar datos para participar en AeroSuite como **Alumno, Instructor y/o Piloto**, uno o varios; **foto NO obligatoria**.

- **Datos personales ampliados:** nombre, apellido, país y fecha de nacimiento; al menos un documento (tipo, número, país emisor y vencimiento si corresponde); residencia (país, provincia, ciudad, dirección, código postal); teléfono móvil requerido; fijo y otros teléfonos opcionales; correo de la cuenta en solo lectura.

- **Datos propios por perfil:** alumno: curso/especialidad de interés; instructor: licencia/habilitación y número declarado, institución/base opcionales; piloto: licencia y número declarados, base y horas opcionales.

- **SEGURIDAD OBLIGATORIA:** autodeclararse instructor o piloto NO acredita credenciales ni permite entrar a legajos ajenos. Institución, matrícula, alumnos asignados y permisos deben verificarse y autorizarse por separado.

- **CODIFICADO, PRUEBA REAL PENDIENTE:** perfiles/documentos privados, declaraciones de rol, Supabase/RLS y bucket privado para foto opcional. No publicar datos personales en Mi Hangar/comunidad. Distinguir documento registrado de documento verificado.

- **PENDIENTE:** usuarios pertenecientes a varias escuelas, inscripción y autorización institucional, invitación/revocación de roles y auditoría de cambios.

## 5. Formación del Alumno / Academia

- **DECISIÓN VIGENTE (26/10/2026):** Academia Aeronáutica se administra como una biblioteca **genérica y dinámica**, sin temarios ni cantidades prefijadas de Teoría o CRM. El administrador sube uno o varios archivos (PDF, imágenes, videos, audio y documentos), cada uno con tarjeta independiente y opciones de descarga, ocultación, publicación y eliminación. Cualquier contenido teórico o de factores humanos se carga como archivo normal; no hay categorías obligatorias.

- **APROBADO:** los archivos didácticos se almacenan en **Cloudflare R2**, y Supabase conserva solo el catálogo y los permisos; sin Google Drive. Límite: **100 MB por archivo**. El reemplazo conserva la versión publicada hasta confirmar la nueva, y el borrado debe limpiar archivo y catálogo.

- **APROBADO:** Simu de Examen PPA basado en materiales ANAC aportados, preguntas aleatorias, opciones múltiples, 1 punto por acierto, explicación fundamentada y revisión técnica obligatoria. Durante prototipo solo admin.

- **CODIFICADO EN ACADEMIA DEL ALUMNO:** accesos funcionales a **Rodaje con viento**, **Cálculo de Sustentación** y **Mantenimiento de aeronaves** retirados como tarjetas independientes de Utilidades. Reutilizar apps originales mediante visor o apertura completa. No borrar sus archivos ni bitácoras.

- **CODIFICADO:** FlightPrep NAV retirado como tarjeta independiente; planificación consolidada en Flight Operations dentro de AeroSuite, sin suprimir archivo histórico ni rutas.

- **PENDIENTE:** actividades asignables por instructor, progreso, notas, evaluaciones, observaciones, evidencias, versiones imprimibles e interactivas. La lectura de fichas no se considera automáticamente hora académica acreditada.

- **REFERENCIA DOCUMENTAL INTERNA:** manual teórico aeronáutico previamente compartido se usa solo como consulta para ideas; generar texto y gráficos originales, no copiar contenido protegido ni identificar la fuente públicamente cuando no sea exigible por atribución.

## 6. Instrucción y Jefatura

- **APROBADO:** vista específica de instructor/jefe con alumnos asignados, planes de clase, registros de vuelos, horas, asistencia, evaluaciones, correcciones y seguimiento.

- **PENDIENTE:** reglas y autorizaciones por institución, revisión/aprobación del jefe, registros RAV, régimen CIAC y no CIAC cuando corresponda, trazabilidad de firmas/cambios y notificaciones.

- **APROBADO:** Flight Operations accesible también desde Instrucción, con interfaz formativa sin IA, incluso si el administrador simula el rol.

## 7. Flight Operations — planificación de vuelo

- **APROBADO:** aplicativo compartido de Alumno e Instructor y de la comunidad Gente de Vuelo, sin duplicar fuentes ni base. Reportes de prevuelo y navegación.

- **Flujo deseado de cinco etapas:** (1) datos del vuelo: UTC, origen/destino/alternativo OACI, VFR/IFR; (2) piernas, puntos editables, CV/CD/RV/Var/DM/RM/NM; (3) boletines METAR/TAF/SIGMET/PRONAREA manual/NOTAM; (4) TAS, altitud por pierna, viento, GS, ETE/ETA, litros y reservas editables; (5) informe esencial de riesgos y compatibilidad temporal.

- **SEGURIDAD:** boletines con emisión/vigencia y fuente; nunca inventar datos ni equiparar informes educativos a un despacho oficial. Reglas VFR por pierna cuando correspondan; validar PRONAREA vigente antes de IA.

- **APROBADO:** IA solo administración en primera etapa; autorizaciones de tokens; Vista Alumno/Instructor sin IA.

- **PENDIENTE:** sugerencia automática de piernas/alternativos, búsqueda por nombre/lat-long, FIR automática, mejoras SIGMET, contador de tokens, informe impreso unificado y revisión/corrección pedagógica por instructor.

## 8. AeroLocator — geolocalización y pistas

- **NOMBRE APROBADO:** AeroLocator; mapa integrado en Gente de Vuelo y AeroSuite. Mantener URL histórica de pistas-no-oficiales para no romper enlaces.

- **APROBADO:** seis clases: aeropuertos públicos controlados, aeródromos públicos no controlados, aeródromos privados registrados, LAD, helipuertos/helipuntos, pistas no oficiales/sin verificar. Las referencias OpenStreetMap no implican habilitación ANAC.

- **APROBADO:** PC con pantalla dividida, panel lateral 25–30 % y mapa amplio; filtros superficie (asfalto, tierra, césped), ATS, acceso, VFR/IFR; pines profesionales por categoría, ficha lateral con medidas, orientación, elevación, obstáculos, observaciones y fotos aprobadas.

- **APROBADO:** Leaflet con zoom y cambio satélite/calles; busca ciudad mediante Nominatim a demanda (sin autocompletado con servicio público), coordenadas o pistas registradas; flyTo, cache y control global de peticiones.

- **APROBADO:** regla de distancia NM y rumbo **verdadero inicial**, sin confundir rumbo magnético; pin de aporte por clic/pulsación larga; moderación de propuestas y fotos R2 antes de publicación.

- **SEGURIDAD:** pista no verificada marcada con alerta severa, exclusivamente referencia para análisis de contingencias; no afirmar aptitud ni autorización. METAR cercano de estación identificada (no METAR inventado de pista informal), AIP/ANAC y NOTAM con fecha y fuente.

- **PENDIENTE:** ampliar/verificar catálogo nacional, permisos, cambios de clasificación con evidencia oficial, comprobar cargas de foto reales y test de mapa en PC/celular.

## 9. Gestión Administrativa, flota y mantenimiento

- **APROBADO:** gestión de aeronaves, agenda, reserva, alumno/instructor, registro de vuelos, RAV según responsabilidades, finanzas, combustible/aceite, stock, documentos y vencimientos.

- **APROBADO:** mantenimiento por motor, fuselaje, hélice, intervenciones, aceite y filtros, revisiones, inspecciones por horas/ciclos/calendario, directivas aplicables, respaldo documental y reportes; umbrales técnicos configurables según aeronave y normativa.

- **SEGURIDAD:** información de mantenimiento privada y con trazabilidad; mover el acceso entre módulos no debe perder los registros. Implementar roles por institución y usuarios autorizados.

- **IDEA:** modelo por flota y usuario, con precio provisional registrado en comercialización; propietario y escuela pueden compartir referencia a aeronave sin duplicarla ni facturar dos veces por error.

## 10. Experiencia visual, comunicación y navegación

- **DECIDIDO:** estructura estética premium azul aeronáutico/gris carbón y tipografía legible, responsiva. Presentación AeroSuite con avión sobre la pista y titulares ubicados arriba para no tapar el avión.

- **DECIDIDO:** acceso del admin desde portada Gente de Vuelo como AeroSuite, con herramientas comunitarias disponibles al resto. Del menú a la presentación, no directo a demo. Botón «Ingresar a la demo» y regresos a Gente de Vuelo.

- **MATERIAL:** afiche AeroSuite «PRÓXIMAMENTE» formato 9:16 para publicación en portada de Gente de Vuelo, formación/instrucción/gestión, avión realista. No confundir imagen diseñada con inserción efectiva en sitio.

- **APROBADO:** separar datos reales de ejemplos «DEMO», evitar solapamientos y priorizar facilidad de uso para piloto/escuela en PC y celular.

## 11. Infraestructura, seguridad y estado de implementación

- **Arquitectura existente:** repositorio GitHub Gente de Vuelo, Supabase Auth/Postgres/RLS, Cloudflare R2 para multimedia/PDF aplicables, Vercel para despliegue del sitio.

- **NO HACER:** crear perfiles institucionales inseguros, divulgar documentos/credenciales/EXIF, borrar registros por cambiar un menú, fusionar datos de alumnos entre escuelas, publicar pistas comunitarias como oficiales, usar fotos comunitarias sin autorización.

- **PENDIENTE:** verificación de permisos multi-escuela, ensayos de registro/fotos, backups/exportaciones, integración de cobro/factura, auditorías, escalabilidad y pruebas reales con escuelas piloto.

- **ESTADO EL 25/10/2026:** varios cambios de código y pruebas automáticas en GitHub se completaron, pero algunos despliegues de Vercel fallaron por límite de frecuencia (build-rate-limit). No decir «ya publicado» si no se confirmó despliegue posterior.

- **SEGUIMIENTO:** actualizar cada decisión comercial, función y resultado de encuesta aquí, dejando fecha, motivo, alcance, cambios sobre decisiones anteriores y estado verificable. El archivo IDEAS-seguimiento-aeronaves.md conserva detalle del modelo económico.


## 28/10/2026 — Padrón central de registros AeroSuite

- **Superadministrador:** reemplazada la gestión de cuentas dentro de cada tarjeta por una sección única **«Registros de AeroSuite»**, con búsqueda y filtros por institución, rol y estado. Incluye directores, instructores, alumnos y otros roles institucionales previstos. El lápiz de cada tarjeta sigue editando únicamente nombre, plan y licencia.
- **Interfaz simplificada:** removidos del panel real los accesos a recorrido demo; se mantienen las acciones necesarias para enviar invitación y administrar instituciones.
- **Flujo de registro verificable:** la invitación se registra al crearse en `aerosuite_institution_invitations`. El estado de **registro efectivo** solo se marca al iniciar sesión en el portal de AeroSuite con correo confirmado mediante `aerosuite_record_my_registration`; un usuario técnico creado por `auth.admin.generateLink(type:magiclink)` no equivale a un registro concluido.
- **Consulta segura:** `aerosuite_superadmin_registrations()` reúne invitaciones y cuentas vinculadas y presenta fecha de invitación, fecha del ingreso efectivo, verificación, aceptación y estado. Validación de identidad en el servidor; los datos privados no son públicos.
- **Administración no destructiva de identidades:** `aerosuite_superadmin_manage_registration` permite revocar invitaciones o desvincular accesos institucionales por rol e institución, incluido director, con registro en auditoría. Las credenciales de Auth no se eliminan y un acceso a otra institución se conserva.
- **Verificaciones técnicas:** validación de sintaxis JavaScript, controles de acceso por rol a las RPC y estado de despliegue de Vercel. Pendiente prueba funcional completa con un usuario que efectivamente acepte una invitación en navegador; **no se fabricaron usuarios de prueba ni se alteraron los existentes**.


## 28/10/2026 — Reinicio seguro para pruebas repetidas con los mismos correos

- **Decisión:** permitir repetir desde cero el circuito de invitación de AeroSuite, incluida la identidad de Auth, al eliminar una institución de prueba o cuando el director/superadministrador desvincula un instructor/alumno de prueba.
- **Flag explícito:** `aerosuite_institutions.is_test` (por defecto `false`), activable únicamente desde el Superadministrador. La institución actual Aero Morón quedó marcada como prueba para el circuito en curso.
- **Seguridad:** el borrado automático de Auth únicamente alcanza una cuenta con perfil GdV `gdv_community_member=false`, identificador temporal `piloto_[hex]`, creada durante una invitación de esa institución. Se bloquea si hay membresía comunitaria, superadministración, acceso o invitación de otra institución, otros perfiles, documentos o referencias de terceros. Nunca se limpia una cuenta personal compartida.
- **Función interna:** `private.aerosuite_purge_isolated_test_identity` comprueba vínculos y borra la identidad, credenciales y perfil temporal solo cuando pasa todas las protecciones. No se expone a `anon` ni `authenticated`.
- **Operaciones conectadas:** `aerosuite_delete_institution`, `aerosuite_manage_staff_remove` y `aerosuite_superadmin_manage_registration`. Tras borrar un usuario de prueba también se eliminan sus invitaciones institucionales de ese rol/correo, para volver a enviar una invitación limpia. Las cuentas protegidas permanecen sin cambios de identidad; sí se retira el acceso a la escuela como se solicitó.
- **Interfaz:** casilla «Institución de prueba (reinicio automático)» en alta/edición. Los avisos de baja y eliminación informan cuántas identidades técnicas se eliminaron y cuántas quedaron protegidas.
- **Verificación:** se ejecutaron dos pruebas con rollback de SQL sobre Aero Morón, confirmando que los procedimientos de eliminación de escuela y cancelación de invitación habrían borrado Auth, pero el test restauró Auth, invitación e institución. No se efectuó ninguna baja definitiva durante la verificación. Falta prueba de extremo a extremo desde el navegador del director con un instructor/alumno real.


### 28/10/2026 — Circuito de prueba repetible con correos fijos

Se estableció la prueba de extremo a extremo: el Superadministrador crea una institución de prueba, invita al director con `gusfab71@gmail.com`, el director completa el acceso y envía la invitación al instructor con `21912214gf@gmail.com`. El padrón central «Registros de AeroSuite» muestra las invitaciones y sus altas, y permite cancelarlas o desvincular integrantes.

**Reinicio en modo pruebas:** si se elimina la institución, la función de Supabase elimina invitaciones, membresías, auditoría institucional y cuentas técnicas exclusivas en Auth y perfiles. Si se elimina o cancela un instructor, desaparecen también su invitación y auditorías operativas del correo; la función interna puede limpiar además su cuenta Auth temporal, perfil AeroSuite y documentos de la prueba. Se preservan administradores de Gente de Vuelo y AeroSuite, miembros de la comunidad y cualquier cuenta con datos o accesos ajenos a la prueba. No se garantiza borrar registros técnicos de servicios externos ni mensajes ya entregados.

**Enlaces:** Edge Function `aerosuite-invitations` versión 6 crea un segundo enlace `magiclink` cuando el primer `generateLink` inicializó una identidad con `signup`. La página `ingreso-escuela.html` acepta el tipo exacto recibido. La política de contraseña de AeroSuite se ajustó a **9 caracteres exactos** (mayúscula, minúscula, dígito, símbolo).

**Pruebas:** verificado con SQL reversible que la eliminación de Aero Morón y la cancelación de invitaciones borran identidades y registros operativos asociados; todos los cambios de prueba fueron revertidos. HTML validado sintácticamente; Vercel desplegado. Falta aún la prueba real de apertura de nuevo enlace, creación de contraseña y rol de instructor desde el navegador.


## 28/10/2026 — Diseño de portales institucionales y primera etapa operativa

### Decisiones funcionales aprobadas
- **Administración única:** el Director gestiona reservas, alumnos, instructores, flota, informes, cobros, packs, ingresos, egresos y caja chica. Secretaría es **opcional**: cuando se habilite, debe acceder a las mismas funciones y los mismos datos institucionales. Se recomiendan cuentas personales separadas para conservar auditoría. **PENDIENTE:** habilitar invitación/alta y baja del rol Secretaría con toda la cadena de permisos; no compartir contraseñas por defecto.
- **Alumno:** ve la turnera compartida, solicita bloques de **90 minutos** y su solicitud queda **pendiente** hasta que Dirección/Secretaría o instructor autorizado la confirmen; no requiere saldo anticipado para solicitar. Puede consultar sus packs y sus devoluciones de instrucción aprobadas.
- **Instructor:** visualiza la turnera de su escuela, puede **asumir y confirmar** un bloque pendiente que pueda atender; al concluir la práctica presenta informe propio con tiempo de vuelo real, litros cargados de combustible, aceite agregado, devolución pedagógica y novedades observadas.
- **Informes:** Secretaría/Dirección puede aprobar o **devolver para corrección al instructor**; no reescribe la declaración del instructor. Se conservan versiones y motivos. El informe aprobado completa el vuelo.
- **Liquidación:** Dirección/Secretaría decide las horas cobrables o descontables del pack al cierre, independientemente del bloque reservado y del tiempo real informado. Al comprar pack se registra un ingreso monetario; al consumirlo se descuenta saldo horario **sin segundo ingreso de dinero**. Cobro individual y descuento de pack son mutuamente excluyentes para el mismo vuelo. Secretaría y Director comparten toda la administración económica.
- **Flota:** actualización manual de disponibilidad para asignaciones. El Director es notificado por teléfono por el instructor cuando corresponda; no habrá alerta automática por desperfectos ni registro de incidencias forzoso. La marca administrativa no certifica aeronavegabilidad.

### Implementado en Supabase / GitHub — primera etapa
- **Turnera segura:** `aerosuite_flight_bookings`, historial `aerosuite_flight_booking_audit`, RPC `aerosuite_booking_schedule` y `aerosuite_booking_action`. Bloqueos transaccionales para evitar doble ocupación de bloques de 90 minutos, confirmación por administración o instructor, cancelación motivada y asignación posterior de aeronaves. Datos de reservas ajenas anonimizados para el alumno. Una institución no consulta los datos de otra.
- **Instrucción:** `aerosuite_flight_reports` y `aerosuite_report_versions`, RPC `aerosuite_reports_list` y `aerosuite_report_action` con presentación, devolución, corrección y aprobación. La cancelación simple de una reserva con informe presentado se impide para proteger la consistencia.
- **Contaduría de operación:** `aerosuite_hour_packs`, `aerosuite_pack_usages`, `aerosuite_money_movements` y RPC `aerosuite_finance_snapshot` / `aerosuite_finance_action`; ventas de packs, consumo, cobro por vuelo realizado, egresos habituales, gastos de caja chica y devoluciones. Movimientos históricos **append-only** por RPC, sin edición destructiva desde el cliente. Separación de monedas ARS y USD.
- **Flota:** `aerosuite_aircraft_registry` y `aerosuite_aircraft_changes`; RPC `aerosuite_aircraft_list` / `aerosuite_aircraft_action`. Solo Dirección/Secretaría tiene permiso de modificar; Instructor consulta. Matrícula fuera de servicio no se puede asignar al confirmar o actualizar un vuelo.
- **Interfaz:** `portal-escuela.html` enlaza, según rol, a `operaciones-institucionales.html` (turnera, informes, packs y contaduría) y `flota-institucional.html` (Director e Instructor). Tarjetas próximas áreas se distinguen de las operativas. Se conserva el ingreso/invitación original.
- **Pruebas:** flujos reversibles SQL de reserva, confirmación por instructor, presentación/devolución/corrección/aprobación de informe y descuento de pack; no se persistieron registros de prueba. Despliegue web y verificaciones estáticas deben revisarse en cada cambio.

### Siguientes integraciones y límites de esta primera entrega
- **Pendiente:** rol opcional Secretaría en invitaciones, Auth y listados de integrantes. En tablas operativas existe una previsión de permisos, pero no debe considerarse utilizable hasta cerrar el circuito de alta/baja y verificarlo.
- **Pendiente:** Academia Aeronáutica, material y Simulador PPA en la **sesión institucional** del alumno e instructor (aislamiento por institución).
- **Pendiente:** mantenimiento técnico, vencimientos y registro obligatorio separado de la simple disponibilidad administrativa de flota.
- **Pendiente:** disponibilidad de múltiples aeronaves/turnos simultáneos; el MVP usa una plaza por bloque horario institucional. Configurar horario base y zona horaria por institución (por ahora ART, bloques visibles desde las 08:00 cada 90 minutos), tarifas, gestión de deuda y comprobantes fiscales.
- **Pendiente:** contabilidad formal, arqueos de caja, reportes contables completos, conciliación bancaria, ajustes/anulaciones con contrapartidas y otras funciones fiscales. El panel económico actual es de **movimientos internos**, no una contabilidad regulatoria.
- **Pendiente:** pruebas reales autenticadas en los tres dispositivos/cuentas, incluidas UX móvil, licencias en modo lectura y flujos de error. Una aprobación en SQL y un despliegue Vercel no sustituyen esas pruebas.


## Cierre de jornada — 28/10/2026 · Punto de reanudación para el día siguiente

**Estado general:** Se acordó que AeroSuite debe ser sencillo para una escuela pequeña, donde el Director desempeña todas las tareas, y adaptable a escuelas grandes. Se preserva como producto comercial independiente de la comunidad gratuita Gente de Vuelo. No reinventar la organización ni plantear más niveles de aprobación internos sin necesidad.

### Organización final y autoridad
1. **Superadministrador exclusivo:** `gentedevuelo@gmail.com`, administrador de instituciones, licencias, seguridad y cuentas de prueba; no operador ordinario de la escuela. Cuenta protegida contra las limpiezas de prueba.
2. **Dirección / Administración:** un único portal integral. El Director hace por sí mismo las tareas de Secretaría cuando la escuela es pequeña. La **Secretaría es completamente opcional**, de confianza del Director y, si se crea, ve **exactamente la misma información** y puede **hacer y deshacer las mismas operaciones administrativas** que el Director, incluidas reservas, instructores, alumnos, flota, informes, cobros, packs, caja chica, ingresos y egresos. Puede tener cuenta personal independiente (recomendable por seguridad/trazabilidad). Esta igualdad de permisos reemplaza la propuesta anterior de que cada gasto extraordinario requiera obligatoriamente aprobación separada del Director. Mantener auditoría de operaciones. El Director gestiona el alta/baja del acceso de su Secretaría.
3. **Instructor:** turnera de la escuela, toma y confirmación de reservas sin instructor asignado cuando pueda atenderlas, información de sus alumnos, informe propio de actividad y devolución de formación; declara tiempo real, combustible cargado, aceite agregado y novedades de aeronave.
4. **Alumno:** turnera abierta al ingresar, solicita turnos de 90 minutos, observa estado pendiente/confirmado y reservas propias, consulta sus devoluciones validadas, horas y packs; acceso educativo a Academia Aeronáutica, Simulador PPA y utilidades cuando la integración institucional sea segura.
5. **Aislamiento institucional obligatorio:** cada institución accede solo a sus alumnos, instructores, reservas, aeronaves, reportes y contaduría; no utilizar un rol escrito en cliente como sustituto de permisos de servidor.

### Operación acordada sin ambigüedad
- **Reservas:** solicitud del alumno = **PENDIENTE**, nunca confirmación automática. Dirección, Secretaría o Instructor habilitado que asuma el turno podrá confirmarla. Dirección/Secretaría puede cancelar incluso reservas confirmadas; conservar cancelación y motivo en historial en vez de borrado irreversible. Horarios iniciales: tramos de 90 minutos; mostrar turnera semanal clara en móvil y PC; un turno de 90 minutos NO equivale a minutos realmente volados o facturables.
- **Informes:** instructor presenta un informe posterior al vuelo (alumno, aeronave, vuelo, minutos reales, combustible agregado en L, aceite agregado en L, evaluación y novedades). Administración revisa. Si hay error, **devuelve al instructor para que este mismo lo corrija**, conservando versiones; Secretaría/Director no altera la declaración pedagógica/técnica a escondidas. Al validar, cierra la actividad que corresponda.
- **Desperfectos aeronave:** el instructor avisa telefónicamente al Director; se intenta resolver conforme al procedimiento habitual, o la aeronave queda fuera de servicio. No crear por defecto un workflow obligatorio de fallas ni alertas técnicas automáticas. La disponibilidad en el sistema se administra manualmente; no reemplaza obligaciones técnicas o de aeronavegabilidad.
- **Liquidación y packs:** el alumno paga por hora al finalizar el vuelo, o utiliza un pack previamente pagado. La reserva no se bloquea por deuda o falta de pack. **Dirección/Secretaría determina los minutos facturables/descontables**, con independencia del bloque reservado y tiempo real. Registrar el ingreso cuando se cobra el pack; la utilización de horas reduce el saldo pero no vuelve a ingresar dinero. Los cobros de vuelo individual alimentan Contaduría. No imputar por pack y por hora el mismo vuelo. Registrar movimientos con fecha, actor, importe, moneda y concepto; permitir caja chica y egresos habituales. Informes y saldos del Director usan los mismos datos que actualiza Secretaría.
- **Contaduría:** incluir ingresos, egresos, caja chica, cobros por hora, venta de packs, descuentos y saldos, movimientos de alumnos y reportes. Los gastos de combustible/aceite sólo impactan económicamente cuando hay operación/comprobante de gasto; los litros declarados en informes son una cantidad física, no un importe de dinero.

### Implementación confirmada en esta jornada
- Registrado en Supabase: tablas y funciones de turnera institucional, informes versionados y devoluciones, packs de horas, ingresos/egresos y flota administrada manualmente. Controles de rol y pertenencia institucional en funciones del servidor; RLS activo y acceso directo a tablas denegado.
- GitHub/Vercel: `portal-escuela.html` dirige a `operaciones-institucionales.html` (turnera, informes y contaduría según rol) y `flota-institucional.html` (administración modifica, instructor consulta). La Academia y mantenimiento técnico continúan explícitamente en integración.
- Pruebas SQL reversibles: solicitud del alumno, prohibición de confirmación o movimiento económico por alumno, confirmación instructor, informe devuelto y corregido, validación, descuento de pack, imposibilidad de doble cobro y bloqueo de aeronave fuera de servicio. Sin movimientos de prueba persistentes. Verificados sintaxis JS, controles RLS y despliegue Vercel exitoso. **No afirmar todavía que los flujos visuales con sesiones reales se probaron de punta a punta.**

### Lista concreta de continuación para la próxima sesión (prioridades)
1. **Prueba visual autenticada** de los portales de Director, Instructor y Alumno en PC y celular. Verificar que el alumno vea primero su turnera, que el Instructor visualice la agenda y que Administración controle todos los movimientos; corregir errores reales encontrados.
2. **Conectar la turnera de 90 minutos a las aeronaves y ampliar capacidad** para reservas simultáneas con distintas aeronaves/instructores. Corregir horario/semana y disponibilidad respetando la realidad de la institución; no introducir dobles reservas.
3. **Habilitar rol opcional de Secretaría**: invitación, sesión, permisos idénticos a Dirección, baja de acceso; sin imponer Secretaría a la institución.
4. **Integrar Academia Aeronáutica, Simulador PPA y utilidades** a los portales de alumno/instructor sin exponer material de otras escuelas; mantener la carga genérica de material educativo ya acordada.
5. **Completar Contaduría**: gestión de deuda si se necesita, cobros por hora, packs, consumos, devolución/ajustes auditables, comprobantes, caja chica y resúmenes fiables, sin afirmar que la contabilidad interna sustituye contabilidad fiscal.
6. **Flota y mantenimiento**: conservar estados manuales; enlazar informes con horas, combustible, aceite y mantenimiento, pero evitar alertas automáticas de fallas técnicas. Separar seguimiento administrativo de liberación técnica.
7. **Revisar flujos de prueba/reinicio de cuenta** antes de borrar datos: solo identidades técnicas exclusivas de instituciones marcadas `is_test`, nunca Superadministrador ni usuarios de comunidad o de otras instituciones.
8. **Revisión de seguridad y cierre de calidad**: autorización por rol y por escuela en cada RPC, límites de caja y packs, pruebas concurrentes, UI adaptable a móvil, integridad de historiales y publicación estable.

**Punto exacto para retomar:** trabajar sobre los módulos ya publicados; no reiniciar el diseño ni abrir nuevas preguntas generales sobre jerarquías. Priorizar pruebas de interfaz y correcciones operativas; conservar todos los criterios aprobados.


## Continuación 28/10/2026 — Secretaría opcional habilitada

**IMPLEMENTADO EN SUPABASE:** las restricciones de rol admiten ahora `secretaria` en integrantes e invitaciones. Se adaptaron las RPC de aceptación de invitación, registro, acceso institucional, padrón y bajas. Dirección y Secretaría comparten la turnera, informes, contaduría/packs, flota y administración de instructores y alumnos. Solo Dirección (o Superadministración para contingencias) puede desvincular una Secretaría; solo Dirección puede cursar su invitación institucional. La actuación se mantiene asociada a la cuenta personal de cada operador.

**IMPLEMENTADO EN FRONTEND Y EDGE FUNCTION:** `ingreso-escuela.html` acepta el rol `secretaria`; `portal-escuela.html` presenta los módulos comunes de Administración, permite a Dirección invitar a Secretaría de forma opcional, y permite a Secretaría invitar o retirar instructores y alumnos pero no otras Secretarías. `aerosuite-invitations` v7 verifica estos permisos en servidor y envía el correo personal habitual. No se comparte una única contraseña entre personas.

**VERIFICADO EN BASE:** ensayo reversible con una invitación a Secretaría aceptada, acceso a licencia/Contaduría/flota, y denegación del intento de baja de Secretaría desde ese mismo rol; todo se ejecutó con `ROLLBACK` y no persistió registros ficticios. **PENDIENTE:** prueba visual real de invitación, correo, sesión de Secretaría y flujos en PC/celular; no asegurar que esté completamente validada hasta probar con la cuenta destinataria. Mantener pendientes de turnera multiaeronave, Academia institucional y cierre contable.

### 28/10/2026 — Un instructor en dos instituciones
- **PRUEBA REAL CONFIRMADA EN SUPABASE:** la cuenta de un instructor aparece activa simultáneamente en las instituciones de prueba `aviacion Shimoda` (aeródromo) y `director de institucion de prueba` (escuela). Las dos invitaciones figuran aceptadas y registradas. No se creó una segunda identidad ni se duplicó el correo.
- **MEJORA FRONTEND:** `portal-escuela.html` muestra un selector de institución cuando la misma persona tiene más de un vínculo autorizado. Cambiar de institución abre su portal con el ID y rol propios, tomando únicamente accesos vigentes devueltos por `aerosuite_my_institution_access_v2`. Con un solo vínculo, el selector permanece oculto. Los módulos mantienen su validación server-side de institución y rol.
- **SEGURIDAD:** los datos de escuelas diferentes no deben agruparse; no se fusionan turneras, alumnos, aeronaves, informes ni packs por compartir instructor. Las rutinas de limpieza de instituciones de prueba deben conservar identidades que aún tengan vínculos con otra institución.
- **PENDIENTE:** comprobar en una sesión real de instructor que puede alternar entre ambas instituciones, además de ensayar cambios de reservas desde el navegador y dispositivos móviles.


### 28/10/2026 — Organización del Superadministrador por institución con nombres y correos

- **IMPLEMENTADO:** las tarjetas de instituciones incluyen búsqueda por nombre/correo de contacto y filtro por tipo (escuela, aeródromo, aeroclub). El padrón global pasa a sección secundaria, debajo de las fichas institucionales, sin perder sus acciones de registro y desvinculación.
- **IMPLEMENTADO:** dentro de cada institución el Superadministrador puede abrir «Ver nombres y correos del personal». Se listan por separado Dirección, Secretaría, Instructores, Alumnos y roles auxiliares, con nombre de perfil si existe y siempre correo electrónico. Los nombres toman los campos autorizados de perfil AeroSuite y Gente de Vuelo; si faltan, aparece «Sin nombre de perfil» en lugar de inventar un dato. También se identifican invitaciones pendientes.
- **PROTECCIÓN:** la nueva RPC `aerosuite_superadmin_institution_roster(p_institution_id)` exige identidad de Superadministrador, consulta solo el ID solicitado y entrega únicamente nombre, correo, rol, fecha de vínculo e identificador técnico; sin DNI, teléfono, documentos ni otros campos privados. El padrón se carga al abrir la ficha (no se precargan integrantes de todas las instituciones). El rol `anon` no puede ejecutar la RPC.
- **PRUEBAS:** controles SQL sobre pertenencia, preservación del instructor habilitado en dos instituciones, bloqueo de lectura a una cuenta sin Superadministración y sintaxis estática del frontend. **PENDIENTE:** prueba visual autenticada con la cuenta de Superadministración en PC/celular; verificar nombres reales disponibles y comportamiento de filtros. La vista actual de instituciones conserva límite inicial de carga; agregar paginación del catálogo si aumenta más allá del límite.


### 28/10/2026 — Revisión visual de la turnera de Dirección (Aviación Shimoda)
- **Capturas revisadas:** turnera semanal de lunes a domingo, ocho tramos de 90 minutos (08:00 a 20:00 ART), cero reservas en el aeródromo. En ese momento `aviacion Shimoda` tenía 1 instructor y 0 alumnos, por lo que la Dirección todavía no puede solicitar un turno con alumno allí; la escuela `director de institucion de prueba` sí tenía 1 alumno habilitado.
- **CORREGIDO EN UI:** los bloques horarios que ya pasaron figuran como `Pasado` y quedan inactivos; la administración ve un aviso explícito cuando su institución no tiene alumnos registrados, sin confundir esa condición con un error de permisos.
- **CORREGIDO EN SERVIDOR:** el mismo instructor puede estar vinculado a distintas instituciones, pero no confirmar vuelos superpuestos de 90 minutos. La RPC `aerosuite_booking_action` comprueba todas las confirmaciones de ese instructor con exclusión temporal, no solo las de la escuela actual, y serializa las confirmaciones concurrentes mediante bloqueo transaccional del instructor. La respuesta no revela reservas ni nombres de otra institución. Ensayo SQL con dos solicitudes temporales en escuelas diferentes: se confirmó la primera y se bloqueó la segunda; `ROLLBACK` conservó la base sin registros de prueba.
- **LÍMITE ACTUAL:** el MVP aún admite una sola plaza de reserva en cada bloque de 90 minutos por institución, aunque tenga varias aeronaves. Queda pendiente rediseñar la capacidad multiaeronave/instructores sin solapamientos y probar visualmente el circuito de reserva/confirmación/cancelación con cuentas reales.


### 28/10/2026 — Corrección de recuperación de contraseña (Dirección e integrantes)

- **Error detectado en prueba real:** después de pedir la recuperación para la cuenta de Dirección, el enlace enviado por Supabase creaba sesión y podía activar el acceso automático al portal sin mostrar el cambio de contraseña. Abrir el correo no significa que la contraseña haya sido reemplazada.
- **CORREGIDO EN `ingreso-escuela.html`:** ahora `resetPasswordForEmail` devuelve a la misma página con `recuperar=1`; el cliente identifica tanto ese marcador como los vínculos `type=recovery` (implícitos o `token_hash`). Prioriza recuperación antes de aplicar la activación/inicio institucional. Los eventos `SIGNED_IN` no redirigen durante recuperación; se comprueba el token de la sesión y el usuario antes de mostrar el formulario.
- **Cambio obligatorio en el flujo:** la persona introduce y repite una nueva contraseña de 9 caracteres exactos (mayúscula, minúscula, número y símbolo). Solo tras confirmar respuesta exitosa de `auth.updateUser({password})` se libera el acceso al portal y se elimina el marcador de recuperación de la URL. Si el enlace no es válido o el cambio falla, no continúa automáticamente, sino que explica cómo solicitar uno nuevo.
- **PRUEBAS:** 176 comprobaciones previas + 14 nuevas del ingreso; escenarios simulados de `SIGNED_IN` prematuro, sesión de recuperación válida, enlace vacío, fallo de `updateUser`, ingreso habitual, email con nuevo marcador y `token_hash` recuperable. **PENDIENTE:** comprobación real con un NUEVO correo de recuperación, sin tocar contraseñas mediante herramientas administrativas.


### 28/10/2026 — Alumno compartido en dos instituciones y turnera: elección inicial + fechas futuras
- **CASO REPORTADO:** cuenta de alumno vinculada a las instituciones de prueba `aviacion Shimoda` y `director de institucion de prueba`; el ingreso desde un enlace institucional mostraba directamente una escuela, aunque el selector múltiple solo aparecía después, dentro del portal. Además, al observar casillas anteriores de la semana el alumno veía `Pasado` y no distinguía claramente dónde podía reservar.
- **MEJORA IMPLEMENTADA:** `portal-escuela.html` presenta como primera pantalla dos tarjetas de elección (nombre, tipo y rol) si la cuenta autorizada tiene más de una institución. Solo después de elegir aparece su portal y sus módulos; se conserva `institucion`, `rol` y `elegida=1`. La opción «Cambiar de institución» sigue disponible. Con un solo vínculo no se requiere elección. Las consultas RPC autorizadas siguen siendo la fuente de verdad; no se mezclan los datos institucionales.
- **TURNERA CORREGIDA:** `operaciones-institucionales.html` calcula semana y fecha actual de acuerdo con Argentina, incluso en dispositivos con otra zona horaria. Resalta «Hoy» y, en pantallas angostas, desplaza horizontalmente la grilla hasta el día actual para evitar que solo se vean lunes/martes vencidos; diferencia las casillas ya iniciadas como `Pasado` de las futuras `Libre · Reservar`. Incorpora controles «Esta semana» y «Semana siguiente» y una ayuda contextual. No se habilitan turnos anteriores ni se anulan reservas existentes. Los enlaces de regreso desde Turnera y Flota mantienen la institución seleccionada.
- **PRUEBAS:** simulación DOM del selector inicial para Alumno e Instructor con dos instituciones; 214 comprobaciones de regresión del frontend; comparación de horarios ART (lunes anterior y miércoles futuro), sintaxis JavaScript. **PENDIENTE:** prueba de navegador autenticado para verificar que la elección inicial aparezca correctamente y que un alumno pueda crear/confirmar una solicitud real de 90 minutos sin error. La capacidad de múltiples reservas simultáneas por flota sigue pendiente.
