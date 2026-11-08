# AeroSuite — conciliación del historial de migraciones
**Auditoría:** 08/11/2026 · **Rama:** PR #77 · **No se ejecutó SQL ni se alteró el historial de Supabase**.

## Método
Se comparó el hash Git de cada archivo `supabase/migrations/*.sql` con el hash del texto `statements[1]` guardado en `supabase_migrations.schema_migrations` de Supabase principal. La fórmula de Git `blob <bytes>\0<contenido>` se contrastó con casos conocidos.

Para archivos no idénticos se compararon por separado el texto SQL sin comentarios y con formato normalizado, y la secuencia exacta de literales SQL. Solo se sincronizaron los casos de igualdad comprobada. Los que difieren en estructura o literal permanecen pendientes.

## Resultado comprobado
| Indicador | Cantidad |
| --- | ---: |
| Archivos SQL en el repositorio | 114 |
| Migraciones registradas en Supabase principal | 294 |
| Versiones/nombres/contenidos que ahora coinciden exactamente | **94** |
| Archivos locales sin correspondencia exacta | **20** |
| De los 20, misma versión y SQL diferente | **8** |
| De los 20, versión ausente o sin equivalente exacto | **12** |

**Acciones sin tocar Supabase:**
- Se renombraron **75 archivos previamente idénticos byte a byte** para usar la versión y el nombre que constan realmente aplicados (10+65).
- Se restauró en GitHub el texto exacto de **17 migraciones adicionales** cuyo código SQL normalizado y literales coincidían con la versión aplicada (4 con la misma versión, 13 con versión o nombre distintos).
- Se corrigieron tests y documentación que referenciaban rutas anteriores. El workflow de Gestión Aeronáutica ahora vigila todos los cambios en `supabase/migrations/**` para PR y `main`.
- Las acciones no reejecutaron migraciones ni actualizaron `supabase_migrations.schema_migrations`; conservaron intactas las funciones y los datos actuales.

## Bloqueo preventivo de despliegue de base
**No ejecutar `supabase db push`, `supabase migration up` ni un lote automático de migraciones al proyecto principal** hasta clasificar los veinte casos restantes. En ocho casos existe riesgo explícito de **igual versión con SQL diferente**; no alterar nombres o estados de migración para eludir ese conflicto.

Para cerrar:
1. Comparar los 20 archivos restantes con el SQL efectivo y sus dependencias, aclarar si son cambios pendientes, equivalentes o divergentes y conservar historial inmutable.
2. Si hubiera cambios funcionales necesarios, crear nuevas migraciones revisables y probarlas primero en una base aislada que replique la estructura.
3. Obtener respaldo y restauración verificables de PostgreSQL, Supabase Storage y R2, con credenciales de depósito separadas.
4. Ejecutar E2E con JWT real, Director, Secretaría, Instructor, Alumno, PPA y PCA, dos sesiones paralelas, packs vs. efectivo, retorno a servicio aeronáutico documentado y una Preview Vercel coherente.
5. Mantener bloqueada la primera escuela real hasta contar con esas evidencias. Ninguna identidad real debe añadirse al Laboratorio.

**Estado:** 94/114 migraciones alineadas exactamente; **20 sin resolver**. No equivale a autorización de puesta en marcha.

## Recuento de control posterior — 08/11/2026, 17:15 UTC

Se repitió la conciliación consultando directamente los 114 SHA de blobs de la rama
y calculando para las 294 entradas del histórico remoto el SHA-1 Git:
`sha1("blob " + longitud_octetos + NUL + statements[1])`.
Se verificó la fórmula contra tres migraciones conocidas, incluida la última
`20261108160626`. **No se ejecutaron migraciones ni se alteraron filas.**

| Estado exacto | Archivos |
|---|---:|
| Coinciden versión y SHA de bytes | **94** |
| Misma versión, SQL de bytes diferentes | **8** |
| Versión del archivo no presente en historial remoto | **12** |
| **Total en GitHub** | **114** |

**La lista pendiente baja de 33 a 20** respecto del recuento previo. Las cifras
anteriores quedan como histórico, no como estado actual.

### 8 archivos con versión existente pero diferencias de contenido

- `20261031165626_aerosuite_student_declaration_checkout_without_instructor_20261031.sql`
- `20261031175826_aerosuite_hourly_tariff_for_centesimal_flight_checkout_20261031.sql`
- `20261031180244_aerosuite_fixed_monthly_expenses_and_petty_daily_review_20261031.sql`
- `20261031182027_aerosuite_weekly_settlement_manager_only_orange_status_20261031.sql`
- `20261031183437_aerosuite_checkout_actual_aircraft_and_service_state_20261031.sql`
- `20261031183502_aerosuite_daily_financial_fleet_close_snapshot_20261031.sql`
- `20261031184756_aerosuite_institutional_maintenance_independent_from_private_hangar_20261031.sql`
- `20261031190323_aerosuite_canonical_aircraft_registration_all_portals_20261031.sql`

La inspección detectó cambios de comentario, capitalización, delimitadores
`$fn$` / `$function$` y orden de las funciones en algunos archivos; **no se
certificó equivalencia semántica de las ocho migraciones**. No reemplazar el SQL
sin verificar las definiciones finales ni perder cambios deliberados.

### 12 archivos sin versión homónima en el historial remoto

- `20261006003700_contact_admin_reply_and_delete.sql`
- `20261009171200_integral_member_deletion.sql`
- `20261009172000_confirm_integral_member_deletion.sql`
- `20261009181500_google_onboarding_server_enforcement.sql`
- `20261009183500_google_incomplete_legacy_writes_lock.sql`
- `20261012005200_aerochat_webpush.sql`
- `20261012012400_fix_aerochat_push_metadata_grants.sql`
- `20261013175000_home_video_layout.sql`
- `20261013180500_home_video_position_grants.sql`
- `20261101193000_aerosuite_published_activity_availability.sql`
- `20261102034000_aerosuite_pilot_ppa_verified_profiles_institutional.sql`
- `20261102042000_aerosuite_pilot_ppa_commercial_distinct_role.sql`

Que una versión no exista **no permite concluir que falte su funcionalidad**:
puede haberse desplegado bajo otro número o mediante una migración posterior.
Contrastar objetos y contratos efectivos antes de generar cualquier migración.

### Riesgo adicional de cuentas compartidas

La función heredada `public.gdv_admin_delete_member_integral_core` tiene
permiso `EXECUTE` exclusivamente para `postgres` y comprueba el rol
`site_admins`, pero no verifica pertenencia a AeroSuite antes de borrar
`auth.users`. La FK de `aerosuite_institution_members.user_id` usa
`ON DELETE CASCADE`: es un riesgo de pérdida de membresía institucional
mediante la baja comunitaria. Se preparó la protección en
`docs/gdv-guard-baja-comunidad-cuentas-aerosuite-2026-11-08.sql` y el contrato
`tests/gdv-community-delete-aerosuite-guard.test.cjs` en el PR #77. **No
está aplicado en el backend principal**; su prueba actual es estática, no E2E.

Mantener suspendidos el alta de escuela real, la fusión, la publicación
y los empujes masivos de migraciones hasta reconciliar las diferencias y
validar la protección con identidades técnicas en un entorno segregado.
