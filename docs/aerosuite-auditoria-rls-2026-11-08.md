# Auditoría de permisos RLS de AeroSuite — 8 de noviembre de 2026

**Estado:** lectura y verificación de controles de acceso, no auditoría E2E ni certificación integral.  
**Entorno consultado:** Supabase principal de Gente de Vuelo; solo metadatos del esquema y de las **cinco cuentas técnicas del Centro de Testeo Permanente**.  
**Rama de trabajo:** `feat/aerometeo-hourly-visual-20261107`.  
**Reglas de operación:** ninguna escritura de datos, ningún cambio de esquema, ninguna operación sobre cuentas reales, ninguna publicación en Vercel.

## Procedimiento

1. Consultas de solo lectura a `pg_class`, `pg_policy`, `pg_proc`, `information_schema` y al asesor de seguridad de Supabase.
2. Verificación del laboratorio permanente como institución `is_test=true`, `status=active`, `access_mode=active`, con una membresía técnica por rol. Las identidades técnicas se contrastaron con `auth.users.raw_app_meta_data` (`aerosuite_lab=true` y rol coincidente), sin recuperar contraseñas ni tokens.
3. Pruebas SQL en `BEGIN TRANSACTION READ ONLY` usando `SET LOCAL ROLE authenticated` y `request.jwt.claim.sub` para simular la identidad de cada miembro técnico; cada consulta termina en `ROLLBACK`. No se utilizó la identidad de ningún cliente real.
4. Comprobación negativa adicional con un UUID ficticio sin membresías.
5. Lectura del código efectivo de las funciones de autenticación, invitación y autorización.

**Límite de la prueba:** la simulación de `auth.uid()` a nivel de base de datos **no prueba** el inicio de sesión con un JWT firmado, la interfaz real, las acciones de escritura, la concurrencia ni el comportamiento de las funciones Edge. Para esos aspectos hace falta E2E aislado y autorizado.

## Inventario efectivo de RLS

| Control | Resultado |
|---|---:|
| Tablas `public.aerosuite_*` | 44 |
| Con RLS activada | **44 / 44** |
| Sin RLS | **0** |
| Con RLS pero sin políticas directas | 33 |
| Accesibles directamente por SELECT para `anon` | **0** |
| Con SELECT concedido a `authenticated` (sujeto a RLS) | 11 |

Las 33 tablas sin políticas son **cerradas para usuarios comunes por acceso directo**. Varias operaciones se realizan mediante RPC protegidos: `RLS habilitada` no prueba por sí sola que todas esas RPC sean seguras. Tampoco debe añadirse una política abierta solo para silenciar el asesor.

## Resultado efectivo por rol: Academia

| Rol técnico | Leer | Agregar material | Gestionar material |
|---|---|---|---|
| Dirección / Administrador | Sí | Sí | Sí |
| Secretaría | No | No | No |
| Instructor | Sí | Sí | No |
| Alumno | Sí | No | No |
| Piloto PPA/PCA | No | No | No |

La autorización depende de la membresía de la institución, la modalidad de licencia y la función `aerosuite_internal.aerosuite_academy_authorized`. La separación entre alumno, instructor, director y secretaría coincide con los permisos del proyecto.

**Aislamiento:** cada identidad técnica autenticada pudo consultar una sola membresía (la propia); no obtuvo SELECT directo de `aerosuite_institutions`, `aerosuite_permanent_test_lab` ni `aerosuite_test_runs`. La identidad ficticia sin membresía no accedió a instituciones, membresías, sesiones de prueba, documentos, declaraciones de rol ni recursos de Academia.

La ausencia de acceso directo a `aerosuite_institutions` para integrantes comunes es **deliberada**: el portal consulta `aerosuite_my_institution_access_v2()`, que filtra por `auth.uid()` y devuelve solo la pertenencia autorizada.

## Hallazgos adicionales

- **Invitaciones:** `aerosuite_accept_invitation_role()` exige correo confirmado, coincidencia exacta de institución/correo/rol, invitación no revocada ni caducada, y licencia institucional válida. Cambiar `rol` en una URL no basta para adquirir permisos.
- **Registro:** `aerosuite_record_my_registration()` requiere una invitación del mismo correo/rol o una membresía ya existente; no crea arbitrariamente membresías.
- **Declaraciones de licencia:** el esquema exige `verification_state='unverified'`, incluso en altas y modificaciones del usuario. La autorización efectiva de piloto se registra aparte en `aerosuite_pilot_authorizations`; el usuario no puede autovalidarse mediante su declaración.
- **Resultados del Laboratorio:** `aerosuite_test_runs` concede `UPDATE` por columna solo para `steps`, `notes`, `updated_at`, `finished_at`, `status` y `final_snapshot`; no permite modificar `id`, `institution_id`, `started_by` ni `baseline` por UPDATE directo. La política RLS exige ser Superadministrador y que la institución sea de prueba. Por eso `has_table_privilege(...,'UPDATE')=false` **no indica un error**: los permisos por columna sí existen.

## Alertas del asesor de Supabase

**Dos advertencias de EXECUTE anónimo sobre funciones SECURITY DEFINER de tipo TRIGGER:**

- `public.aerosuite_revoke_changed_pilot_license()`
- `public.gdv_queue_replaced_home_media()`

Se verificó que ambas devuelven `trigger`, no una respuesta de función de negocio. Que tengan `EXECUTE` concedido **no demuestra que un usuario anónimo pueda ejecutarlas como RPC y obtener o modificar datos**; las funciones `trigger` no pueden invocarse normalmente como funciones SQL independientes. Aun así, aplicar el principio de mínimo privilegio y revisar/revocar `EXECUTE` concedido a `PUBLIC`/`anon` es una tarea válida de endurecimiento **mediante migración revisada y autorizada**, no un cambio para ejecutar apresuradamente en producción.

- Referencia Supabase: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Las advertencias de funciones `SECURITY DEFINER` ejecutables por usuarios autenticados requieren examen individual de sus guardas de rol, institución y modo de licencia; son interfaces RPC intencionales y no vulnerabilidades demostradas por sí mismas.
- Las alertas de `RLS Enabled No Policy` de las tablas server-only son informativas; ver https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Puertas de salida antes de publicar

- [x] Auditoría de permisos de tablas y funciones críticas por metadatos.
- [x] Prueba SQL de aislamiento y de Academia para las cinco identidades técnicas (solo lectura).
- [x] Confirmación de autenticación y rol en funciones de invitación y acceso.
- [ ] Pruebas E2E con JWT reales de las cinco cuentas técnicas, sin datos clientes.
- [ ] Verificar bloqueo de escritura al terminar la licencia, roles financieros, restricciones de matrícula, RAV y documentación mediante pruebas transaccionales **solo en una base aislada autorizada**.
- [ ] Revisar `SECURITY DEFINER` que modifican finanzas, reservas y miembros; no basta con inspeccionar las funciones de portada.
- [ ] Evaluar la revocación de permisos sobre las funciones tipo TRIGGER en una migración futura revisada.
- [ ] Desplegar una única vista previa de Vercel solo cuando se solicite, validar pantallas y luego pedir autorización separada para producción.

**Conclusión:** los controles de lectura revisados se comportan de acuerdo con el modelo de roles conocido; la seguridad de todas las operaciones y la experiencia E2E continúan sin certificar. Esta auditoría no alteró Supabase.
