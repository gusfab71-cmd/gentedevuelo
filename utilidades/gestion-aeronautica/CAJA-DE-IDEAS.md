# Caja de Ideas de AeroSuite — Documento Maestro

**Actualizado:** 26/10/2026  ·  **Proyecto:** AeroSuite, By Gente de Vuelo

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
