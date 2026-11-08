# AeroSuite — conciliación del historial de migraciones
**Auditoría:** 08/11/2026 · **Alcance:** comparación de GitHub PR #77 con `supabase_migrations.schema_migrations` del proyecto principal, sin ejecutar migraciones SQL.

## Método verificable
Se comparó el identificador **Git blob SHA-1 del contenido exacto** de cada `supabase/migrations/*.sql` contra el SHA calculado a partir de `statements[1]` en el historial real de Supabase. En este proyecto las 294 migraciones registradas almacenaban un único bloque SQL; la fórmula se contrastó con una migración conocida. **No se normalizó texto ni se infirió igualdad por nombres, similitud o longitud.**

## Resultado
- **114 archivos** de migración versionados en la rama, **294 migraciones** registradas como aplicadas en Supabase.
- **75 archivos byte por byte idénticos a migraciones ya aplicadas** tenían número o nombre local distinto al registrado: **10 corregidos en un commit previo y 65 alineados en la misma rama en una segunda revisión**, moviendo los blobs sin modificar ni una línea del SQL.
- Una vez alineados estos 75, **77 de los 114 archivos** coinciden exactamente en versión y contenido con una migración aplicada.
- **37 archivos** siguen sin una contraparte exactamente igual en el historial remoto. Entre ellos, **12 tienen la misma versión que una migración aplicada, pero el contenido no coincide**. Los otros 25 requieren determinar si corresponden a cambios no aplicados, archivos reconstruidos o equivalentes semánticos.
- No se reescribió ningún registro de `supabase_migrations.schema_migrations`, no se ejecutó ningún SQL de estas 75 migraciones y no se modificaron tablas ni datos de producción.
- La acción `Pruebas Gestión Aeronáutica` ahora observa `supabase/migrations/**` en vez de rutas antiguas específicas; los cambios futuros en cualquier migración deben activar su batería de pruebas.

## Límite y regla segura
**El historial no está plenamente reconciliado. NO ejecutar `supabase db push`, `supabase migration up`, ni un lote automático contra el proyecto principal hasta resolver los 37 casos no coincidentes y contar con un respaldo/restauración verificados.** Tener la misma versión no garantiza tener el mismo SQL aplicado. No cambiar las 12 colisiones de contenido ni inventar migraciones aplicadas sin revisar las instrucciones originales y su estado efectivo.

Antes de continuar:
1. Clasificar los 37 archivos restantes por función y comparar el esquema efectivo, sus dependencias y restricciones.
2. Para los 12 con versión idéntica y SQL diferente, revisar diffs reales y decidir una nueva migración correctiva cuando sea necesario; jamás sobrescribir la historia aplicada.
3. Generar y ensayar restauración real fuera de producción, incluida Supabase Storage y Cloudflare R2.
4. Completar pruebas E2E con sesiones JWT reales, dos clientes concurrentes, rol Piloto PPA y PCA separados, respaldo documental de retorno a servicio y Preview Vercel controlada.
5. Aprobar primera institución real solo tras evidencias de todos los puntos. Sigue habiendo cero escuelas reales.

**Estado:** reparación de identificadores exactos de GitHub completada para 75 migraciones; **habilitación de despliegue de base y puesta en marcha real: BLOQUEADAS**.
