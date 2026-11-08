# AeroSuite — conciliación del historial de migraciones
**Auditoría:** 08/11/2026 · **Destino:** rama aislada PR #77 · **Sin ejecutar SQL ni alterar el historial de Supabase**.

## Método y evidencia
Se compararon los **SHA de blobs Git** de `supabase/migrations/*.sql` con los SHA calculados directamente sobre `statements[1]` de `supabase_migrations.schema_migrations` usando el formato Git `blob <bytes>\0<contenido>`. Se comprobó con un archivo conocido y, antes de mover nada, se exigió coincidencia exacta de bytes. Se revisaron asimismo las referencias a archivos en tests, documentación, scripts y workflows.

## Resultado
- **114 migraciones SQL** en GitHub frente a **294 entradas** del historial aplicado de Supabase.
- **75 archivos con contenido byte a byte idéntico** a migraciones aplicadas se habían guardado con otro número o nombre: se movieron para que coincidan con el historial efectivo (10 en una primera corrección, 65 en una segunda), sin alterar un solo byte de SQL.
- En **4 archivos adicionales con la misma versión**, la comparación sin comentarios ni cambios de formato devolvió el mismo contenido funcional y la secuencia de literales SQL resultó idéntica: se restauró en GitHub el SQL exacto que figura aplicado. No se ejecutó SQL nuevamente.
- **81/114 archivos** ahora coinciden simultáneamente en número de versión, nombre y bytes del SQL.
- **33 archivos** siguen sin correspondencia exacta de bytes: **8 tienen la misma versión que una entrada de Supabase pero difieren en contenido relevante o estructura**; los otros **25** requieren investigación adicional. La ausencia de coincidencia NO demuestra automáticamente que no estén aplicados.
- El workflow de Gestión Aeronáutica se corrigió para observar **`supabase/migrations/**`**, en lugar de rutas específicas obsoletas, tanto para PR como para `main`.

## No hacer hasta resolver los 33 casos
1. NO ejecutar `supabase db push`, `supabase migration up` ni aplicación en lote de SQL sobre el proyecto principal.
2. Clasificar las 33 diferencias restantes contra las definiciones efectivas de tablas, funciones, políticas e índices; no equiparar SQL por nombre, longitud ni similitud.
3. Crear migraciones nuevas y revisables solo para cambios que de verdad falten. No reescribir `supabase_migrations.schema_migrations` para fingir que se aplicaron.
4. Ensayar una restauración real de PostgreSQL, archivos de Supabase Storage y objetos Cloudflare R2 en entorno segregado antes del alta de cualquier escuela.
5. Completar E2E con navegador autenticado, identidades separadas PPA/PCA, concurrencia de dos clientes, retorno a servicio documentado y Preview Vercel de frontend/backend compatibles.

**Seguridad operativa:** este control no elimina las advertencias de Supabase Auth ni sustituye auditoría de operaciones con JWT. La rama permanece sin fusión a producción y no se autoriza la primera institución real.
