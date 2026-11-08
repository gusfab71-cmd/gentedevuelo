# AeroSuite — auditoría integral y estado verificable
**Fecha:** 08/11/2026. **Repositorio:** gusfab71-cmd/gentedevuelo. **Rama:** feat/aerometeo-hourly-visual-20261107. **PR:** #77, abierto y borrador, sin fusionar ni desplegar a producción en Vercel.

## Resultado ejecutivo
**Estado general: pruebas disponibles ejecutadas, tres correcciones de backend aplicadas, pero NO certificado para activar una escuela real.**
Ningún ensayo de este informe creó ni importó datos reales de instituciones. La base principal conserva una sola institución, de tipo prueba, y cero escuelas reales.

## Migraciones y trazabilidad
- GitHub: **117** archivos SQL de migración; Supabase principal: **297** entradas aplicadas.
- **105/117** coinciden simultáneamente en versión y SHA Git del SQL aplicado, incluidos los tres fixes del 8/11.
- Se restauraron en GitHub los **ocho** contenidos históricos que tenían misma versión pero bytes divergentes, sin ejecutar esas migraciones otra vez.
- **12 archivos históricos** siguen sin versión correspondiente en el historial remoto; se comprobaron 20 objetos/funciones/políticas representativos presentes en el esquema efectivo, pero eso NO certifica equivalencia de todo el SQL. Evitar cualquier `supabase db push` o ejecución de migraciones en lote hasta clasificar cada caso.
- No se modificó manualmente `supabase_migrations.schema_migrations`.

## Correcciones efectivamente aplicadas en Supabase principal
1. `20261108181828_aerosuite_published_slot_edit_maintenance_guard`: un turno de vuelo publicado vuelve a comprobar avisos de mantenimiento al modificar matrícula, inicio, actividad, institución o publicación; el trigger se extendió a esas columnas. Una prueba transaccional sobre CTP confirmó bloqueo de matrícula desconocida y **0 filas sintéticas persistentes**.
2. `20261108182207_gdv_guard_aerosuite_shared_identity_deletion`: la baja comunitaria ahora prohíbe eliminar una identidad con membresía, documentación, invitación o referencias históricas de AeroSuite, evitando cascadas y pérdida de autoría. Una prueba reversible de baja de identidad técnica devolvió denegación; permanecen **5 miembros de CTP y 25 usuarios de Auth**.
3. `20261108182921_aerosuite_academy_rls_finance_index_performance`: las políticas de INSERT/DELETE de Academia usan `(SELECT auth.uid())` sin cambiar la regla de autorización. Se retiró el índice financiero redundante `aerosuite_money_movement_period_idx` y se conservó el equivalente `aerosuite_money_inst_created`. El asesor ya no muestra los dos avisos de `auth_rls_initplan` de Academia ni el índice duplicado.
- La serialización de cobros `20261108160626`, aplicada antes, se conserva y no se reinstaló.

## Ensayos de lectura, integridad y regresión
- **53/53** tablas públicas `aerosuite_*` con RLS activada.
- **0** funciones `SECURITY DEFINER` públicas ejecutables por rol `anon`, según consulta de catálogo previa.
- Impersonación SQL reversible del CTP (no JWT real): Academia mostró **2 recursos** a Dirección, Instructor y Alumno; **0** a Secretaría y Piloto. Los permisos siguen iguales tras la optimización.
- En CTP principal: 21 reservas de vuelo históricas, **0** activas futuras, **0** pares superpuestos de aeronave, **0** cobros duplicados entre dinero y pack, **0** checkouts duplicados y **0** packs sobregirados.
- Licencias: `trial` o `active` vencidas pasan inmediatamente a `read_only` en pruebas de la función pura; `blocked` continúa cerrado.
- Laboratorio relacional segregado: **35/35 ensayos** de `aerosuite_lab.run_full_weekly()`, con mismos recuentos antes y después de `ROLLBACK`.
- GitHub Actions: seis workflows (Gestión, Mantenimiento, Auditoría Semanal, AeroLocator, AeroMeteo horario y fuentes) completaron con éxito en el último commit comprobado. Tests añadidos cubren por contrato las dos protecciones y las optimizaciones; estos tests no equivalen a E2E con JWT.

## Mantenimiento y aeronavegabilidad
- Tres aeronaves ficticias del CTP tienen seis avisos de nivel informativo: horas iniciales y controles técnicos sin documentar. No se inventaron Hobbs, horas de motor, inspecciones ni liberaciones.
- La defensa de edición/publicación está reforzada; no sustituye la evaluación técnica y documental por personal autorizado ni certifica aeronavegabilidad.

## Backups y recuperación
- Script de backup corregido en GitHub: `pg_dump` conserva ACL/GRANT/REVOKE; se comprueba que el índice contenga entradas `TABLE DATA public aerosuite_...` y se limpia el inventario temporal. No se suben volcados sin cifrar.
- **No se ha hecho un volcado con secretos reales ni una restauración comprobada**. El workflow es manual y todavía necesita destino S3 independiente y clave age; los archivos de Supabase Storage y Cloudflare R2 exigen copia y restauración separadas.
- La existencia del script y los tests estáticos no satisface el objetivo de recuperación.

## Asesor de Supabase, revisión final
**Seguridad**
- 53 avisos `rls_enabled_no_policy` de nivel informativo, mayormente tablas server-only intencionalmente cerradas; no crear políticas públicas sin un caso explícito.
- 92 advertencias de funciones `SECURITY DEFINER` accesibles a `authenticated`, que requieren revisión por interfaz/rol y no implican 92 vulnerabilidades confirmadas.
- 1 advertencia de protección de contraseñas filtradas desactivada en Supabase Auth: ajuste de plataforma pendiente.
**Rendimiento**
- 102 FKs sin índice de cobertura (no indexar indiscriminadamente sin estudiar consultas/escrituras).
- 9 políticas `auth_rls_initplan` restantes, todas ajenas a las dos políticas de Academia corregidas.
- 35 conflictos potenciales de políticas permisivas, 15 tablas sin PK y 11 índices sin uso según estadísticas. Requieren análisis por objeto; no son automáticamente defectos de AeroSuite.

## Puertas de salida: no se pueden declarar completas
- [ ] Conciliar los 12 SQL históricos sin versión equivalente; definir un procedimiento limpio de reinstalación/recuperación sin `db push` accidental.
- [ ] E2E real con JWT firmado por todos los roles, dos clientes concurrentes contra RPC productivas y reprogramación, sin alterar datos reales.
- [ ] Preview Vercel de revisión frontend/backend coincidente y validación visual en escritorio y móvil. La rama mantiene `vercel.json -> git.deploymentEnabled=false`, y el conector Vercel no está instalado; no se abrió despliegue.
- [ ] Test de restauración integral: PostgreSQL + Supabase Storage + Cloudflare R2, con verificación RLS y recuperación de permisos.
- [ ] Verificar y documentar retorno a servicio, programa de mantenimiento y documentos aeronáuticos; RAV formal requiere procedimiento/firma auténtica.
- [ ] Resolver ajuste de contraseñas filtradas y revisar cada interfaz privilegiada de negocio antes de calificarla como segura.
- [ ] Aprobación explícita de la primera escuela y alta limpia con cero registros ficticios.

**Conclusión:** se ejecutó la auditoría que permiten las conexiones de GitHub y Supabase y se corrigieron tres fallos/costes verificables del backend. **No corresponde declarar auditoría integral terminada ni liberar producción** mientras faltan las pruebas de navegador, recuperación real y conciliación histórica.
