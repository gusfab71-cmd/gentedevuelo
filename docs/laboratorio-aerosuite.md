# Auditoría semanal automatizada de AeroSuite

**Estado: auditoría semanal de código y disponibilidad, sin validación E2E real todavía.**

- Programación: lunes 09:00 de Argentina (cron UTC: 12:00). GitHub puede demorar el inicio. Se puede lanzar manualmente desde Actions.
- Ejecuta siete baterías de regresión para reservas, usuarios, reglas, mantenimiento, registro, informes, vuelos y finanzas ficticias.
- Los 8 escenarios de laboratorio usan motores DEMO y exclusivamente datos en memoria. Los 5 escenarios faltantes siguen identificados como NO PROBADO.
- En las ejecuciones semanales y manuales verifica por GET cuatro páginas públicas de AeroSuite, sin iniciar sesión ni modificar información.
- Guarda en la ejecución de GitHub un resumen y archivos JSON, Markdown y salida de pruebas durante 30 días.
- Un test fallido genera estado FALLÓ. Si todos pasan, informa PARCIAL, nunca "AeroSuite enteramente funcional".
- No usa claves Supabase, no ejecuta SQL, no crea cobros ni reservas, no cambia Vercel.

## Iniciar manualmente

GitHub → Actions → AeroSuite - Auditoria semanal automatica → Run workflow.

## Probar localmente

Con Node.js 22, desde el repositorio:
    node scripts/aerosuite-weekly-audit.mjs

## Segunda fase necesaria

Para auditar el funcionamiento integral se requiere base Supabase aislada sin datos reales, esquema reproducible, seis identidades ficticias (Director, Secretaría, Instructor, Alumno, PPA y PCA) y Playwright; deberán verificarse RPC, RLS, turnera, cobros, packs, informes, mantenimiento, permisos y conciliación de datos entre portales. La rama remota de Supabase puede tener costo y debe autorizarse por separado. No realizar reset, importaciones o certificaciones aeronáuticas en producción.
