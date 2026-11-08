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


## Implementación preparada (no ejecutada)

Se agregó la acción **AeroSuite - Respaldo cifrado manual (sin programación)** en `.github/workflows/aerosuite-backup-manual.yml` y el script `scripts/aerosuite-backup-encrypted.sh`.

El flujo NO tiene disparador por horario, push o pull request. Solamente se inicia manualmente con el texto exacto `COPIA-CIFRADA-MANUAL`, luego de que el administrador configure los secretos y apruebe el destino. Utiliza un volcado lógico PostgreSQL 17 (el servidor actual corre 17.6), prueba el índice con `pg_restore --list`, cifra con **age** antes de la subida a un depósito S3 privado independiente y compara el tamaño del objeto remoto. Los datos sin cifrar se destruyen al terminar la ejecución.

### Secretos de GitHub requeridos (no configurados aquí)

- `AEROSUITE_BACKUP_DB_URL`: conexión de exportación PostgreSQL, preferentemente directa o pooler en sesión, con TLS. Nunca incluirla en archivos del repositorio.
- `AEROSUITE_BACKUP_AGE_RECIPIENT`: clave **pública** age; la clave **privada** para descifrar se custodia **fuera de GitHub, Supabase y el mismo depósito**.
- `AEROSUITE_BACKUP_BUCKET`: bucket privado, exclusivo para respaldos cifrados.
- `AEROSUITE_BACKUP_S3_ENDPOINT`: endpoint S3 compatible del bucket de destino.
- `AEROSUITE_BACKUP_S3_ACCESS_KEY` y `AEROSUITE_BACKUP_S3_SECRET_KEY`: permisos mínimos de escritura, lectura de metadatos y sin ACL pública.

**No se ha ejecutado ningún respaldo real**, no se han agregado credenciales, ni se ha cambiado ningún plan o gasto.

### Verificaciones todavía obligatorias

El script genera y almacena exclusivamente **un backup de PostgreSQL**. Para disponer de un respaldo recuperable completo también hace falta:

1. Configurar copia de los **binarios de Supabase Storage** (los archivos no están en el volcado SQL).
2. Configurar copia y versionado de los **objetos de biblioteca de Cloudflare R2**, en ubicación y credenciales independientes.
3. Proteger y ensayar la recuperación de claves de descifrado fuera de la cuenta de servicio.
4. Realizar una **restauración real, completa y comprobable en un entorno aislado** y documentar RPO, RTO y periodicidad de auditoría.
5. Activar programación recurrente **solo después** de comprobar manualmente la copia cifrada y la restauración; hasta entonces el workflow no se ejecuta solo.

La prueba `pg_restore --list` solo comprueba que el archivo contiene un índice legible, **NO** demuestra que los datos puedan restaurarse.

La documentación oficial confirma que el plan Free no ofrece backups diarios automáticos restaurables directamente desde el panel: https://supabase.com/docs/guides/platform/backups. La copia de Storage debe efectuarse separadamente: https://supabase.com/docs/guides/storage/management/download-objects.

Esta tarea sigue **bloqueante para la primera escuela real**.

## Auditoría de consistencia del script (8/11/2026, revisión posterior)
Se encontró que `pg_dump --no-privileges` omitía ACL/GRANT/REVOKE,
dejando una restauración potencialmente distinta en accesos y permisos.
El script fue corregido para **conservar privilegios de PostgreSQL**
(manteniendo `--no-owner` para separar la propiedad). También rechaza
la subida si el índice de `pg_restore --list` no incluye entradas
`TABLE DATA` para AeroSuite y elimina el inventario temporal al salir.

Esta medida **NO certifica** que los grants puedan restaurarse en un
proyecto vacío ni que estén configurados los roles externos: hace falta
restaurar en una instancia Supabase segregada, comprobar las políticas RLS
y repetir auditorías de acceso con JWT. El backup sigue manual, sin
credenciales ni destino validados y no cubre por sí solo Storage o R2.
