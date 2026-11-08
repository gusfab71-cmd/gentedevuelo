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

## Auditoría real de RLS (solo lectura)

El **8 de noviembre de 2026** se revisaron las 44 tablas `aerosuite_*` de Supabase y se simularon, en transacciones `READ ONLY`, las cinco identidades técnicas del Centro de Testeo Permanente. Las 44 tablas tenían RLS habilitada, ninguna concedía SELECT directo a `anon`, y se confirmó el aislamiento de membresías y las autorizaciones de Academia y del control económico por rol.

**Alcance:** validación de base de datos y funciones de acceso; sigue **pendiente** la prueba E2E con sesiones reales de navegador, JWT, pagos y reservas ficticias. No se realizaron escrituras ni cambios en Supabase.

Informe, evidencia y advertencias pendientes: [Auditoría RLS de AeroSuite · 08/11/2026](aerosuite-auditoria-rls-2026-11-08.md).
