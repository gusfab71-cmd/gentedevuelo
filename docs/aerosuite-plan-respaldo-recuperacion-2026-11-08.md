# AeroSuite · Respaldo y recuperación antes de la primera escuela

**Fecha:** 08/11/2026 · **Estado:** procedimiento propuesto, **no ejecutado ni verificado**.

## Hallazgo

La organización Supabase de Gente de Vuelo está en **plan Free**. En la documentación de Supabase de noviembre de 2026, las copias automáticas diarias se incluyen en Pro/Team/Enterprise; Free requiere gestionar exportaciones propias. No se encontró en el repositorio un `pg_dump` ni un `supabase db dump` programado. Esto NO demuestra que no haya copias externas privadas, pero sí que **no hay un mecanismo de recuperación comprobable mediante los conectores actuales**.

La copia de seguridad de PostgreSQL contiene metadatos de objetos de Storage, **no** los archivos binarios; Cloudflare R2 requiere un respaldo y una recuperación independientes.

Referencias oficiales:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/storage/buckets/fundamentals

## Requisitos de activación (bloqueantes)

1. Definir responsable del respaldo y sustituto; elegir plan Supabase Pro con backups documentados **o** configurar exportaciones automáticas y cifradas de PostgreSQL para la opción Free, sin agregar secretos al repositorio. La opción debe ser acordada y costeada previamente por el titular.
2. Programar copias con retención fuera del proyecto original. Cifrar los respaldos, limitar permisos, monitorear resultado y generar alertas de fallos.
3. Exportar **por separado** los objetos privados y metadatos de Supabase Storage, incluyendo `aerosuite-academia-institucional` y `aerosuite-student-portraits`. No confundir copias de SQL con los archivos.
4. Verificar el inventario y la capacidad de restauración de objetos de Cloudflare R2, especialmente los documentos de biblioteca alojados allí. Confirmar que puedan restaurarse accesos y rutas coherentes con la base de datos.
5. Ensayar al menos una **restauración real** en una instancia segregada (no sobre producción), con datos desidentificados si hay usuarios reales. Comparar cantidad de instituciones, membresías, aeronaves, packs, movimientos, reportes, evidencias y Storage.
6. Definir RPO, RTO y criterios de retención según necesidad del aeroclub y reglamentación; no dar por supuesto un plazo.
7. Prohibir volcar datos personales, licencias/CMA, correos, accesos o claves R2 a repositorios GitHub, PR, logs de CI o archivos públicos.
8. Documentar evidencia de última copia exitosa, fecha y resultado del último ensayo de recuperación, y responsable que autoriza la entrada en producción.

## Situación a la fecha

- Sin escuelas reales en Supabase (solo Laboratorio).
- Sin copia ni restauración solicitada o ejecutada aquí; no se modificó la política de facturación.
- Ninguna credencial se guardó en este documento.
- La autorización de incorporación de una escuela real debe esperar a la validación de estas condiciones y la versión Vercel publicada.
