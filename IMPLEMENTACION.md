# Comunidad Gente de Vuelo — trabajo iniciado el 27/09/2026

## Estado

Primera integración funcional en rama de desarrollo. No reemplazar `main` hasta completar CAPTCHA, revisar el diseño en navegador real y realizar la prueba cerrada. El frontend nuevo todavía no está publicado. El esquema de Supabase sí está aplicado y no elimina las tablas originales.

## Respaldo

- Código original: rama `respaldo/antes-comunidad-2026-09-27`, commit `1c956a4fc55088dfde3b8af399d831aa83f2d37b`.
- Datos originales: copia de las 13 tablas de `public` en el esquema privado `gdv_backup_20260927`, sin permisos de acceso para visitantes ni usuarios.
- Esta copia es una instantánea de datos; no reemplaza una política periódica de backups de Auth, Storage y esquema completo.

## Implementado

- Portada original, imagen y logo conservados. Logo plano con halo dorado suave, sin inclinación ni relieve.
- Menú integrado: Inicio, Foro, Temáticas, Rincón Shimoda, AeroTrade, AeroShop, Mi Hangar con sesión, Quiénes somos, Normativa de la Comunidad y Contacto.
- Registrarse a la izquierda e Ingresar a la derecha. Los espacios comerciales y Shimoda mantienen sus pantallas existentes.
- `comunidad.html`: foro por categorías, rutas navegables, buscador y filtros, publicaciones resumidas y tema completo.
- Trece temáticas con bienvenida y reglas específicas.
- Fotos de perfil a la izquierda, comentarios anidados con máximo de tres niveles visuales, plegado y enlaces a comentarios.
- Compartir, aporte útil, premio reversible, guardados privados, seguir tema y denuncias.
- Editor con formato básico, vista previa, borrador local, resumen, etiquetas, fuentes, campos de travesía y adjuntos.
- Archivos nuevos en bucket privado. Imágenes reexportadas a WebP para eliminar metadatos y reducir tamaño. Enlaces firmados con vencimiento. MP4/WebM y PDF admitidos con límites de tamaño. No se implementó antivirus de archivos.
- Mi Hangar reúne actividad, multimedia y travesías sin duplicar publicaciones; enlace al editor de perfil existente.
- Notificaciones dentro del sitio por respuestas y revisión, panel de moderación para temas, comentarios, denuncias y contactos.
- Registro en dos pasos con comprobación de usuario, confirmación de contraseña y correo posterior. La configuración de CAPTCHA vacía impide finalizar el registro nuevo.
- RLS, confirmación de email y restricciones de cuenta en base de datos. Revisión previa hasta tres temas aprobados y cinco comentarios aprobados; cuenta restringida siempre bajo revisión. Auditoría de cambios de temas/comentarios.
- Se copiaron 4 publicaciones, 3 comentarios, 1 travesía y 3 entradas de galería a la estructura nueva (8 temas, 3 comentarios, 4 adjuntos). Las tablas originales siguen intactas.
- Nombre de usuario único sin distinción de mayúsculas, validación de caracteres y nombres reservados desde el servidor.
- Se revocó la ejecución pública de dos funciones internas de trigger detectadas por el asesor de seguridad.

## Validado

- Sintaxis JavaScript y `git diff --check`.
- Lectura real de Supabase desde el DOM: siete temas aprobados visibles, trece categorías, bienvenida de STOL, apertura de tema y diálogo de compartir.
- Registro: contraseñas distintas bloqueadas, disponibilidad de usuario consultada y paso de correo posterior; no se crearon cuentas de prueba.
- Pruebas SQL con rollback: alta y moderación de tema/comentario, ocultación de pendientes a visitantes, prevención de autoaprobación por un usuario restringido.
- Recuento de datos originales conservado; bucket nuevo privado.
- El navegador local no pudo arrancar por restricciones del entorno. No se da por realizada la validación visual de escritorio/móvil.

## Puertas de lanzamiento y alcance pendiente

1. Crear o localizar el widget real de Cloudflare Turnstile, habilitarlo en Supabase Auth y colocar únicamente la clave pública en `assets/community-config.js`. La clave secreta nunca va en GitHub. Verificar confirmación de email y recuperación con una cuenta de prueba consentida.
2. Pruebas visuales de portada, hilos, formularios y anexos en PC y celular, y prueba cerrada antes de publicar.
3. Completar sincronización/corte de migración: durante el desarrollo, las publicaciones nuevas del sitio viejo aún no se copian automáticamente. Incorporar también aportes destacados y agenda con clasificación revisada. No retirar los formularios viejos antes del corte final.
4. Completar etapas avanzadas del plan: roles de moderación por categoría, sanciones y apelaciones con gestión completa, notificaciones por mención, preferencias y correos por suscripción, verificación institucional, vigencia/renovación y límites comerciales, solicitudes de eliminación de cuenta a siete días, cambio de usuario a 90 días, contadores de visitas, estadísticas y respaldos periódicos.
5. El editor actual admite formato básico; faltan enlaces de editor y menciones asistidas. Se conserva el historial interno, pero no una vista de comparación de versiones.
6. La eliminación de comentarios en esta primera versión conserva el marcador incluso si no tiene respuestas. El retiro de publicaciones con respuestas queda para el circuito administrativo de solicitud.
7. Contacto nuevo requiere cuenta confirmada. Falta cerrar un canal de asistencia para quienes no puedan ingresar y la revisión profesional de textos legales prevista en el plan.
8. Protección contra contraseñas filtradas figura desactivada en Supabase; revisar disponibilidad en el plan antes de habilitarla.

## Código y base

`assets/comunidad.js` usa la clave **publicable** del proyecto; los permisos los impone RLS. `db/` documenta los cambios ya aplicados; no ejecutar de nuevo en producción a ciegas. `community.sql` contiene la definición consolidada de la base, y los archivos siguientes conservan las correcciones.

## Continuación del 28/09/2026

El usuario pidió dejar CAPTCHA pendiente y completar el resto. No se ha eliminado ni simulado esa protección. El registro nuevo continúa bloqueado hasta su configuración.

Completado en esta revisión:
- Ingreso por usuario o correo. La función `username-login` autentica la contraseña contra Supabase Auth; el correo se resuelve solo en servidor mediante RPC restringida a `service_role`. Límite de diez intentos por usuario cada cinco minutos.
- Editor de Mi Hangar integrado, foto de perfil recortada y sin metadatos, y cambio de usuario limitado a una vez cada 90 días con historial privado.
- Edición de comentarios, solicitudes de retiro, formato con listas y enlaces, menciones enlazadas y notificación de menciones aprobadas.
- Borradores con los campos de travesía, aviso antes de salir, validación previa de archivos, límite de seis adjuntos también en servidor.
- Filtro de fotos reparado, vista de video en las tarjetas, acceso independiente a AeroShop y recuperación de todos los lotes de datos (sin truncar a 200 temas).
- Panel para mover/fijar/cerrar/reabrir/restaurar temas, editar bienvenidas y normas, consultar historial, restringir cuentas o suspenderlas por 7/30 días con motivo y notificación.
- Revisión previa también ante cambios de título, resumen, categoría, fuente, etiquetas o ruta; autor no puede reabrir un tema cerrado por moderación. Suspensiones permiten enviar apelación privada por Contacto.

Verificación:
- `npm test`: navegación, migas, filtros multimedia, HTML escapado, formato, cuenta anónima, mostrar contraseña, borrador de travesía, perfil y controles de moderación.
- `tests/permissions.sql`: transacción con rollback; no deja contenido, perfiles ni sanciones de prueba. Comprobó autoría, publicación pendiente, imposibilidad de autoaprobar, moderación de cambios de título, cierre y suspensión con canal de apelación.
- RPC de login: acceso denegado a anon y authenticated; permitido solo a service_role.
- Endpoint de login devuelve error genérico ante credenciales de prueba inexistentes. No se han utilizado contraseñas reales ni creado cuentas de prueba.
- Asesor de seguridad: las tablas privadas sin políticas están bloqueadas por diseño; sigue pendiente la protección contra contraseñas filtradas.

Pendiente: prueba de ingreso correcto y correo con cuenta real; CAPTCHA; revisión visual y prueba cerrada; migración final; los componentes avanzados todavía enumerados arriba (moderadores por categoría, expiración comercial, suscripciones por correo, eliminación de cuenta y respaldos periódicos). Esta revisión no es un lanzamiento definitivo del plan integral.
