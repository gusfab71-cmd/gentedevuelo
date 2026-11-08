# AeroSuite — revisión de reservas sin instructor, liquidaciones y packs
**Fecha:** 8 de noviembre de 2026
**Entorno observado:** Supabase principal Gente de Vuelo (solo lectura de definiciones, índices y disparadores).
**Estado:** auditoría parcial y propuesta de hardening NO APLICADA. El laboratorio separado y la producción no se alteraron. No hubo sesiones JWT, reservas ni transacciones económicas.

## Hallazgo H-01 — titular de la autorización en la reserva sin instructor
**Prioridad:** alta para corregir antes de nuevas pruebas comerciales.

La función efectiva `public.aerosuite_reserve_with_instructor(p_institution_id, p_slot_id, p_student_id, p_with_instructor)` verifica la licencia en `aerosuite_pilot_authorizations` usando `coalesce(p_student_id,auth.uid())`.

La función delegada `public.aerosuite_availability_reserve(...)`, en cambio, determina el titular efectivo según el rol:
- Dirección / Secretaría: `p_student_id`.
- Alumno / Piloto: siempre `auth.uid()`, sin usar `p_student_id`.

**Consecuencia potencial:** un Alumno autenticado que conozca el UUID de un piloto validado podría suministrarlo como parámetro y generar para sí una **solicitud pendiente** sin instructor aunque él mismo no tenga la autorización. **No se ha probado una explotación** en navegador o con JWT.

**Límite mitigador comprobado:** la función de confirmación `public.aerosuite_confirm_without_instructor` comprueba nuevamente el rol administrativo, la matrícula/turno y `aerosuite_pilot_authorizations` para `v_booking.student_id` (titular real), por lo que el análisis **no demuestra** que el vuelo se pueda confirmar indebidamente.

**Propuesta sin aplicar:** `docs/aerosuite-propuesta-reserva-sin-instructor-2026-11-08.sql`. Selecciona explícitamente el titular efectivo, niega la modalidad sin instructor a `alumno` y conserva la validación original de piloto autorizado y el control de acceso al llamar al RPC delegado.

**Regresión incorporada:** `tests/aerosuite-pilot-booking-hardening.test.cjs`, integrada al workflow `AeroSuite - Auditoria semanal automatica`. Es un **control de contrato de la propuesta**, NO prueba del comportamiento de Supabase en producción.

## Controles económicos examinados
- `aerosuite_money_movements` tiene índice único parcial para `booking_id` cuando `movement_type='hour_payment'`.
- `aerosuite_pack_usages` tiene índice único para `booking_id`.
- `aerosuite_flight_checkouts` tiene índice único en `booking_id`, además de los identificadores de cobro/movimiento.
- `aerosuite_student_debts` tiene índice único parcial para `booking_id` no nulo.
- Existe el disparador `aerosuite_no_void_pack_usage` que ejecuta `aerosuite_internal.aerosuite_guard_void_pack_usage()`: rechaza uso de packs anulados.
- `aerosuite_instructor_fee_pay` comprueba rol administrativo, licencia activa y vuelo liquidado, bloquea la reserva con `FOR UPDATE` y rechaza un segundo pago del mismo vuelo.

**Sin certificar:** la exclusión recíproca bajo concurrencia de los caminos heredados `aerosuite_finance_action(...,'pack_use',...)` y `aerosuite_finance_action(...,'hour_payment',...)` requiere ensayos transaccionales en una base aislada. Los índices antes indicados operan sobre tablas distintas y no son por sí solos prueba de que ambos métodos no puedan liquidar simultáneamente un mismo vuelo.

## Informes y licencias
- `aerosuite_submit_flight_report_with_logbook` delega la validación en `aerosuite_report_action`, que comprueba identidad, miembro de institución, estado de licencia, instructor asignado, horarios y estado de informe.
- Los controles estáticos y la existencia de índices no sustituyen pruebas por roles con sesiones reales.

## Próximos pasos de validación
1. Ejecutar el SQL propuesto **solo en una base aislada que reproduzca el esquema**; luego realizar pruebas reales de roles con JWT de laboratorio.
2. Probar Alumno + UUID de Piloto validado (debe rechazarse), Piloto validado propio (debe permitirse pedir), Piloto no verificado (rechazarse), Dirección/Secretaría para Piloto validado (permitirse), y confirmación sin instructor solo por gestión (requiere referencia).
3. Comprobar cobro por efectivo/packs en paralelo y conciliación, sin usar clientes reales.
4. Crear una migración formal mediante herramienta Supabase CLI y someterla a revisión, **solo después** de aprobar la propuesta y pasar las pruebas aisladas.
5. Antes de cualquier publicación: revisión de Vercel Preview, con despliegue de producción pendiente de autorización independiente.

**Sin cambios de datos, permisos, funciones o esquemas en Supabase. Sin merge ni publicación en Vercel.**
