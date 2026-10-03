# Gente de Vuelo — consolidación

## 1. Concepto y flujo del moderador

Ingresar → Mi Hangar → Moderación privada. La solapa aparece únicamente para integrantes de `site_admins` o `gdv_moderators`. Supabase verifica el permiso en cada operación; ocultar botones no es el control de seguridad.

El panel presenta reportes, aportes pendientes, cuentas restringidas y alertas con tres denunciantes distintos. Cada reporte conserva un enlace al hilo y al comentario exactos. El moderador puede actuar desde el panel o desde el menú discreto «⋯ Moderación» del contenido.

## 2. Solapa privada

| Componente | Función |
| --- | --- |
| Indicadores | Reportes, aportes pendientes, cuentas restringidas, alertas prioritarias |
| Cola de publicaciones y comentarios | Aprobar, mantener en revisión o rechazar con motivo |
| Reportes | Abrir contexto y registrar resolución |
| Gestión | Buscar publicaciones; revisar cuentas, categorías e historial |
| Consultas | Leer solicitudes de revisión y retiro enviadas por Contacto |

## 3. Controles contextuales y conversación

El listado general se sustituye por la vista del tema al abrir una publicación. Las migas permiten regresar a la categoría o al foro. Los comentarios usan `topic_id` y `parent_id`, cuya correspondencia comprueba el servidor. Cada rama tiene líneas guía y un botón para plegar todas sus respuestas. En pantallas pequeñas se limita la sangría visual sin modificar la relación entre respuestas.

Usuarios: comentar, responder, compartir, valorar, guardar, seguir y menú de opciones para editar o reportar. Moderación: visibilidad, cierre, reapertura, cambio de temática y aviso privado. Los controles de moderación solo se dibujan para el personal autorizado.

## 4. Permisos y reportes

| Rol | Facultades |
| --- | --- |
| Visitante | Leer contenido aprobado y perfiles públicos |
| Integrante confirmado | Publicar, responder, editar lo propio, guardar, seguir y denunciar |
| Moderador | Revisar aportes y reportes, cerrar/reubicar temas, enviar avisos privados y consultar auditoría |
| Administrador | Lo anterior, además de restringir/suspender cuentas y modificar categorías o designaciones de moderadores |

Las primeras tres publicaciones aprobadas y los primeros cinco comentarios aprobados establecen los umbrales de revisión. Las cuentas restringidas mantienen revisión previa. La casilla de contenido comercial exige revisión en cada envío; los clasificados conservan su circuito independiente de aprobación. Una denuncia no elimina ni oculta automáticamente el contenido. Tres denunciantes diferentes elevan la prioridad. Se admite un reporte pendiente por usuario y contenido; máximo diez por hora.

Las sanciones administrativas son revisión previa, suspensión de siete días o de treinta días y rehabilitación. Cada medida exige motivo y genera notificación privada e historial. La revisión se solicita mediante Contacto. No se asigna reputación automática opaca a los usuarios.

## 5. Datos, implementación y UX

Se reutilizan `gdv_topics`, `gdv_comments`, `gdv_reports`, `gdv_members`, `gdv_audit`, `gdv_notifications`, `gdv_contact`, `profiles` y `gdv_member_presence`. Se agregan `gdv_moderators` y `gdv_warnings`. Las nuevas tablas tienen RLS y concesiones explícitas. Los roles no provienen de metadatos editables del usuario. Los ayudantes privilegiados residen en `gdv_private`; sus funciones de trigger no son ejecutables por clientes.

El historial es de lectura exclusiva del personal autorizado y no puede alterarse mediante la API pública. La presencia usa un latido de treinta segundos y caduca tras noventa: indica actividad reciente, no garantiza que la persona esté mirando la pantalla.

Las herramientas FlightPrep usan código local, exportan JSON y abren el diálogo de impresión para guardar PDF. Peso y Balance usa exclusivamente libras y pulgadas y compara un rango rectangular ingresado; no sustituye la envolvente real del manual. NAV exige referencias coherentes de viento y rumbo; las reservas son valores elegidos por quien calcula, no requisitos reglamentarios automáticos.

Documentación técnica consultada: https://supabase.com/docs/guides/database/postgres/row-level-security y https://supabase.com/docs/guides/api/securing-your-api.
