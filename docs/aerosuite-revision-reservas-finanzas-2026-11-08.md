# AeroSuite — auditoría de reservas sin instructor, liquidaciones y packs
**Actualizado:** 8 de noviembre de 2026. **Entornos:** Supabase principal (lectura y una migración correctiva sin datos) y segundo proyecto Supabase aislado (datos ficticios eliminados).

## H-01 — Identidad del piloto en una reserva sin instructor
**Estado: corregido en la función efectiva; falta E2E autenticado.**

El hallazgo histórico detectaba que la autorización se consultaba con `coalesce(p_student_id,auth.uid())` mientras que la reserva delegada usaba siempre `auth.uid()` para Alumno/Piloto. La inspección de la **función actualmente desplegada** `public.aerosuite_reserve_with_instructor` ya NO contiene ese cálculo: obtiene el titular efectivo `v_pilot` como `p_student_id` para Dirección/Secretaría y como `v_actor=auth.uid()` para otros roles, y compara autorizaciones y documentación de ese titular.

Esto reduce el riesgo de usar el UUID de otro piloto para crear solicitudes sin instructor. La confirmación sin instructor vuelve a verificar autorización. **No se ha ejecutado aún un ataque simulado real con JWT y sesiones del navegador.** La propuesta histórica `docs/aerosuite-propuesta-reserva-sin-instructor-2026-11-08.sql` se conserva como antecedente, pero **ya no debe presentarse como solución pendiente sin comprobar previamente la definición efectiva**.

## H-02 — Condición de carrera entre los caminos heredados de cobro y pack
**Estado: corregido en Supabase principal; resta prueba E2E de ambos métodos concurrentes.**

La función anterior `public.aerosuite_finance_action` consultaba la reserva **sin `FOR UPDATE`** en `pack_use` y `hour_payment`. Los índices únicos son independientes entre las tablas de pagos y uso de packs, por lo que **no excluían por sí solos** un cobro por cada vía en paralelo.

Se aplicó la migración Supabase `20261108160626_aerosuite_serialize_legacy_flight_settlements`, que bloquea siempre la **misma fila de reserva** con `SELECT ... FOR UPDATE` antes de ingresar a ambos caminos. No cambió las reglas de aprobación, rol, saldo, tarifas, matrícula ni el registro histórico. La definición correctiva queda versionada en:
- `supabase/migrations/20261108160626_aerosuite_serialize_legacy_flight_settlements.sql`
- `docs/aerosuite-fix-serializacion-cobros-2026-11-08.sql`
- `tests/aerosuite-finance-serialization.test.cjs`

Las baterías CI aprobaron el contrato de código tras la corrección del propio test. La implementación en SQL está verificada por metadatos y migración aplicada; **no se afirma que un test concurrente real del RPC productivo haya aprobado**.

## Ensayos ejecutados en el laboratorio Supabase aislado
- `aerosuite_lab.run_full_weekly()` en transacción con `ROLLBACK`: **35/35 aprobados**; las cantidades de miembros, reservas, reportes, cobros y resúmenes no cambiaron.
- Dos reservas simultáneas de la **misma aeronave y horario**, alumnos e instructores distintos: una aceptada, otra rechazada por `lab_aircraft_overlap`, una sola fila final.
- Dos liquidaciones simultáneas de diferentes vuelos con **un pack de 90 minutos**: una aceptada, otra rechazada por saldo insuficiente; un único uso.
- En la prueba cruzada de efectivo vs. pack para una misma reserva, la infraestructura bloqueó una de las llamadas. Los asientos resultantes eran coherentes, **pero esa prueba no es concluyente**.
- Se eliminaron datos ficticios nuevos y se comprobaron los recuentos de limpieza.

El laboratorio tiene siete tablas simplificadas y funciones de simulación. **No es un clon completo de las RPC ni del esquema de producción.**

## Permisos verificados sin escrituras
- Supabase principal: 53 tablas públicas `aerosuite_*`, las **53 con RLS**.
- Alertas de mantenimiento: Dirección, Secretaría e Instructor autorizados; Alumno y Piloto denegados (42501).
- Conciliación económica: Dirección y Secretaría autorizados; Alumno, Instructor y Piloto denegados (42501).
- Son simulaciones de `authenticated` y `auth.uid()` en transacciones `READ ONLY`, **no pruebas de JWT firmado desde navegador**.

## Puertas obligatorias para primera institución real
1. Preview Vercel de la misma revisión frontend/backend; sesiones reales de cada rol y validación visual (bloqueado por cuota de despliegue).
2. Prueba de dos clientes con reservas de dos aeronaves y reprogramaciones en el circuito productivo aislado, junto con efectivo vs. pack concurrentes usando RPC efectivas y JWT.
3. Revisión de RAV formal, informes, retención documental y retorno a servicio respaldado por documentación técnica; el control administrativo no certifica aeronavegabilidad.
4. Respaldo cifrado de PostgreSQL, Supabase Storage y R2; restauración probada en instancia segregada; el workflow de backup actual **no se ha ejecutado con credenciales ni destino configurado**.
5. Revisión de advertencias SECDEF y protección contra contraseñas filtradas; las advertencias no equivalen sin más a vulnerabilidades explotables.
6. Autorización explícita del responsable para el alta de la primera escuela y para la publicación final; ningún dato sintético debe copiarse a esa institución.

**No se publicaron cambios en Vercel ni se fusionó el PR #77.** La migración de serialización sí fue aplicada al backend y está documentada.

## Conciliación y mantenimiento — hallazgos observados en el CTP (solo lectura)

La RPC `aerosuite_reconciliation_open_items` devolvió **8 incidencias históricas únicamente en la institución de test**:
- 1 informe aprobado (60 minutos, 02/11) sin liquidación registrada.
- 1 checkout histórico (96 minutos, 31/10) sin matrícula conciliada.
- 6 reservas pasadas sin informe entre el 31/10 y el 02/11.

**Acción segura:** conservar trazabilidad y no inventar vuelos, matrículas, cobros ni RAV. Estas incidencias son del CTP y no se trasladan a la primera escuela real, que inicia con historial vacío. Se mantienen identificadas para conciliación documental o cierre administrativo de test, no se silencian por borrado de evidencias.

`aerosuite_maintenance_alerts` devolvió **3 aeronaves ficticias con 6 avisos**: falta cargar horas iniciales y controles técnicos en las tres. Ninguna tenía un vencimiento `due` respaldado por datos cargados. La guarda efectiva de publicación **sí filtra por la matrícula específica del turno**, y bloquea si sus alertas contienen `level='due'`; no bloquea otras aeronaves por un vencimiento ajeno. La ausencia de documentación no permite declarar aeronavegabilidad ni completar contadores por cálculo; se exige carga verificada antes del alta de escuela real.

## Control Vercel — discrepancia corregida

Se comprobó que `vercel.json` tenía `git.deploymentEnabled['feat/aerometeo-hourly-visual-20261107']=true` aunque el seguimiento lo suponía apagado. Se cambió a `false` en la rama, manteniendo `main=true`. GitHub reportó `Vercel: success` para un commit anterior, pero no se obtuvo una URL Preview pública ni validación visual auténtica; la existencia de un estado exitoso no equivale a revisión E2E. El HEAD posterior al apagado mantiene todas las pruebas CI aprobadas y sin estado de despliegue Vercel.
