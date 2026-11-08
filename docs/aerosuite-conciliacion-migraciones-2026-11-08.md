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
