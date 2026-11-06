# AeroSuite — Laboratorio automático con datos ficticios
**Estado: fase 1 (pruebas offline de módulos DEMO). No demuestra que la plataforma operativa esté lista.**

## Aislamiento
- GitHub: desarrollo en rama independiente, sin publicar en Vercel.
- Datos de ejemplo únicamente en memoria, sin usuarios reales, copias de tablas, accesos Supabase ni credenciales.
- Identificadores ESCUELA-FICTICIA, ALUMNO-FICTICIO, INSTRUCTOR-FICTICIO, aeronave LV-TST.
- El flujo GitHub Actions produce un archivo TAP y lo conserva 14 días.
- Las pruebas nunca deben usar secretos de producción ni escribir en una base remota.

## Ejecución
Requiere Node.js 22. Desde la raíz:
    node --experimental-default-type=module --test tests/aerosuite-laboratorio.test.mjs

En un pull request, GitHub Actions ejecuta el flujo AeroSuite - laboratorio ficticio.

## Cobertura fase 1
- Alumno, instructor y recursos: reservas de 90 min, duplicidad y bloqueos.
- Vuelo simulado, horas exactas y aterrizajes.
- Informe borrador, presentación y aprobación; proyección del alumno.
- Libro no certificado, RAV administrativo, caja y transferencia ficticias.
- Pruebas TODO visibles para toda funcionalidad todavía no verificada.

**Límite fundamental:** Los módulos JavaScript utilizados se identifican expresamente como demostración. La interfaz institucional real, RPC, RLS, Auth y mantenimiento productivos aún no están probados por este laboratorio.

## Fase 2 pendiente: laboratorio E2E real
1. Crear un Supabase aislado con esquema completo y **sin datos personales ni copias de producción**; obtener aceptación de costos si la rama remota es de pago.
2. Resolver la ausencia de una migración base completa: el directorio de migraciones actual amplía una base anterior y no garantiza reconstruirla desde cero.
3. Crear usuarios y fixtures ficticios para Director, Secretaría, Instructor, Alumno, PPA y PCA.
4. Hacer pruebas reales de RPC, permisos RLS por usuario e institución, reservas, packs, mantenimiento y pagos con rollback/reconstrucción SOLO en la base descartable.
5. Apuntar Playwright a esa base y una versión de desarrollo; guardar capturas, trazas y errores.
6. Separar estados: APROBADO, FALLÓ, NO PROBADO. Nunca declarar el sistema listo con pruebas únicamente DEMO.

**Prohibido:** ejecutar db reset contra producción, copiar registros reales, exponer service_role o certificar automáticamente aptitud aeronáutica.
