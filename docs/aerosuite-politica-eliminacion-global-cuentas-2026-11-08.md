# Decisión de producto — Padrón Global y eliminación de cuentas
**Fecha:** 8 de noviembre de 2026
**Estado:** definición funcional y propuesta de desarrollo; borrado global NO implementado ni desplegado.

## Autoridad y alcance
El Superadministrador de Gente de Vuelo / AeroSuite, autenticado con la cuenta autorizada de la plataforma (actualmente `gentedevuelo@gmail.com`) y la membresía efectiva de `public.aerosuite_superadmins`, debe poder seleccionar cualquier cuenta ordinaria en el Padrón Global y decidir su baja. La autorización depende del ID autenticado en Supabase, **nunca de comparar una cadena de correo enviada por el navegador**.

El Padrón Global debe mostrar también el rol `piloto`, junto con Director, Secretaría (opcional), Instructor y Alumno.

## Dos operaciones distintas
1. **Desvincular de la institución / Cancelar invitación** (ya existe): retira exclusivamente ese rol de esa institución. Conserva la cuenta Gente de Vuelo, otras membresías y los históricos. Está preparada una corrección en la rama para incluir `piloto`, tanto en el filtro y etiqueta como en la propuesta SQL de `aerosuite_superadmin_manage_registration`.
2. **Eliminar definitivamente la cuenta** (solicitado, pendiente de implementar): anula el acceso global y elimina la identidad de Supabase Auth únicamente tras una verificación transaccional de la vinculación de datos y reglas de conservación. Nunca debe presentarse una baja institucional como si eliminara la cuenta global.

## Requisitos de seguridad para el borrado total
- Solo Superadministración con sesión verificada y autorización consultada del lado servidor; considerar autenticación multifactor reforzada para esta acción.
- Prohibir eliminar la propia cuenta Superadministradora, otros superadministradores y cuentas especiales protegidas desde el botón común.
- Mostrar antes de confirmar todas las instituciones afectadas, roles, participación en la comunidad y existencia de vuelos, informes, saldos, facturas, movimientos, libros y auditorías.
- Confirmación doble, ingresando correo/identificador y la frase `ELIMINAR CUENTA`; motivo registrado y evento persistente en auditoría, con actor, fecha y alcance.
- No borrar físicamente registros económicos, horas de vuelo, informes, RAV ni evidencias institucionales sujetos a trazabilidad: diseñar conservación y disociación de la identidad antes de eliminar Auth.
- No suprimir accesos de una segunda institución accidentalmente. La operación global debe advertir expresamente que afecta a todos los servicios; en caso de conflicto de dependencias, **rechazar sin realizar cambios parciales**.
- Deshabilitar sesiones/accesos antes de completar la eliminación y contemplar recuperación ante fallas. Validar en entorno aislado y auditar RLS/Edge Functions antes de activar.
- No utilizar la función antigua `gdv_admin_delete_member` indiscriminadamente: fue diseñada para contenidos de la comunidad, no contempla por sí sola el conjunto de vínculos AeroSuite.

## Verificación técnica a 2026-11-08
- `aerosuite_superadmin_manage_registration` activa permite revocar invitación o desvincular una membresía, **no borrar Auth**.
- Su parámetro `p_role` aún no acepta `piloto` en producción. Hay propuesta corregida en `docs/aerosuite-propuesta-baja-pilotos-padron-global-2026-11-08.sql`, **NO aplicada**.
- La versión en GitHub del Padrón Global ya muestra Piloto (pendiente de despliegue).
- Se observaron más de sesenta tablas del esquema público con referencias a `auth.users`; muchas relaciones AeroSuite mantienen `NO ACTION` o `RESTRICT` para preservar información. Esto impide asumir que una baja de Auth será segura.
- No se eliminó ni suspendió ninguna cuenta. No se cambió Supabase ni Vercel.

## Criterio de aceptación futuro
- El Superadministrador puede seleccionar cualquier usuario ordinario, inspeccionar el impacto y ordenar eliminación global confirmada.
- Si no hay dependencias de conservación, se elimina la identidad y todos los accesos autorizados, con rastro de auditoría.
- Si hay obligaciones de conservar historiales, el sistema ofrece revocación inmediata de acceso y una operación controlada de disociación/eliminación, sin destruir la trazabilidad.
- Otros roles no pueden ejecutar ninguna acción de eliminación global, aunque manipulen parámetros del navegador.
