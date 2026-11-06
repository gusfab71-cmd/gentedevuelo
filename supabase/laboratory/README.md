# AeroSuite — laboratorio SQL gratuito aislado

**Proyecto de pruebas:** Supabase \`djvjaxkukephniwixpra\` · **plan Free confirmado USD 0/mes**. El proyecto productivo \`lmoifzyhqmccvmgitlcp\` no fue modificado.

## Qué se instaló

1. \`01_free_lab_contracts.sql\`: esquema privado \`aerosuite_lab\` con identidades ficticias, aeronaves ficticias, reservas, informes, packs, usos y cobros. Las funciones de ensayo comprueban reglas de 90 minutos, superposiciones mediante exclusiones, bloqueo por mantenimiento, licencia declarada/validada y liquidación única. La prueba reinicia **únicamente estas tablas ficticias del segundo proyecto** y registra un resultado agregado.
2. \`02_schedule_free_lab.sql\` y \`03_early_weekly_schedule.sql\`: \`pg_cron\` ejecuta \`aerosuite_lab.run_weekly()\` los lunes **08:50 hora argentina**, antes del informe GitHub Actions de las 09:00.
3. \`public.aerosuite_lab_audit_summaries\`: tabla exclusivamente de resultados agregados, sin información personal; RLS permite solo lectura con clave **publishable**. La escritura está reservada al proceso SQL.
4. El panel \`Superadministrador → Centro de Monitoreo\` permite consultar el resultado en modo lectura. GitHub Actions ejecuta un control REST de estado y fecha en los eventos semanales/manuales, además de los tests de código.
5. No hay un token \`service_role\`, contraseña, cuenta productiva ni autorización de escritura en el repositorio o el navegador.

## Alcance y limitaciones

**Estos 10 controles son simulaciones relacionales PostgreSQL, NO pruebas de los RPC de producción.** Aún faltan replicar el esquema real de AeroSuite, activar usuarios Auth ficticios para seis roles, ejecutar sus verdaderos RPC/RLS y pruebas Playwright contra una instalación del frontend apuntada solo al proyecto de laboratorio.

No hay que considerar validada ni liberar AeroSuite hasta completar esas pruebas y la revisión humana. No copiar datos personales al laboratorio ni ejecutar las migraciones de este directorio en producción. Mantener estos scripts fuera de \`supabase/migrations/\` para impedir que despliegues habituales los apliquen al sitio real.

## Controles de costo

Supabase Free permite dos proyectos activos; se confirmó un cargo de **USD 0/mes** antes de crear el segundo. No se activaron ramas de pago, Pro, complementos ni servicios externos. GitHub es un repositorio público y las auditorías se ejecutan mediante GitHub Actions.

**Advertencia:** los proyectos Free pueden pausarse por baja actividad en torno a una semana. Si el monitor muestra “Desactualizado”, comprobar el estado de este segundo proyecto en Supabase y reanudarlo manualmente, sin migrar a un plan de pago.

## Repetir la prueba de laboratorio de forma manual

En el SQL Editor del **proyecto de laboratorio exclusivamente**:

\`\`\`sql
select aerosuite_lab.run_weekly();
\`\`\`

Para examinar resultados:

\`\`\`sql
select run_at,checked_count,passed_count,failed_count,status,cases
from public.aerosuite_lab_audit_summaries
order by run_at desc limit 5;
\`\`\`

La carpeta \`supabase/laboratory\` se mantiene separada de las migraciones de producción para evitar su despliegue accidental.
