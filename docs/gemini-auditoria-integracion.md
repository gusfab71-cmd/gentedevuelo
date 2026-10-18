# Integración Gemini — Auditoría técnica (preparación)

Estado: **diseño, sin integración operativa ni despliegue a producción**.

## Propósito
Gemini actúa como revisor independiente de los cálculos de Flight Operations. No decide ni cambia datos de vuelo, no publica modificaciones y no sustituye la verificación del piloto.

## Arquitectura prevista
1. Interfaz de administración autenticada solicita una auditoría.
2. Función de servidor Vercel verifica el token de sesión con Supabase Auth y consulta el rol de administrador mediante una comprobación segura en el servidor.
3. La función valida longitud y estructura de la entrada. El límite adicional de solicitudes queda pendiente; la integración se mantiene desactivada por defecto.
4. La función llama a Gemini API con `process.env.GEMINI_API_KEY`, nunca desde código público ni mediante variables con prefijo `VITE_`/`NEXT_PUBLIC_`.
5. Devuelve observaciones estructuradas y registra errores sin guardar secretos ni datos personales.

**No implementar un endpoint público sin autorización comprobada en el servidor.** Ocultar un botón no es control de acceso.

## Alcance inicial
- Auditar IAS, TAS, GS, viento/deriva, rumbos y combustible usando casos sintéticos.
- Comparar contra cálculos determinísticos y pruebas automatizadas; la IA no constituye una referencia certificada.
- No enviar registros de usuarios, datos de autenticación, claves, archivos privados ni planes de vuelo reales al nivel gratuito sin evaluar las condiciones de tratamiento de datos.
- No modificar lógica existente de Flight Operations ni Supabase.
- Mantener toda salida de Gemini como sugerencia sujeta a revisión humana.

## Preparación y seguridad
- Variable de entorno del proyecto Vercel: `GEMINI_API_KEY` (tipo Secret). El usuario indicó que la guardó en Production; su presencia y funcionamiento **no se han verificado** desde GitHub.
- Usar un modelo Gemini disponible para el proyecto y confirmar su cuota/precio antes de cada despliegue.
- Considerar que las variables agregadas en Vercel pueden requerir un nuevo despliegue para aplicarse.
- Confirmar configuración de autenticación, rol admin, límites de Google y medidas antiabuso antes de activar la función.
- No agregar nunca el valor de la clave a GitHub, logs, capturas ni chat.

## Criterios de aceptación para la implementación futura
- Petición sin sesión o con usuario no administrador: rechazada.
- Petición válida: auditoría sin datos sensibles, respetando las cuotas gratuitas de Google; evaluar controles antiabuso antes de habilitar.
- Error de Gemini o cuota agotada: error controlado, sin bloquear Flight Operations.
- No se modifica ni se publica ningún cálculo automáticamente.
- Pruebas en Preview y autorización expresa antes de integrar a `main`.

## Estado de implementación (2026-10-17)
- Prototipo de función en `api/gemini-audit.js`, **desactivado** salvo que `GEMINI_AUDIT_ENABLED=true` y exista `GEMINI_API_KEY`.
- Se retiró la dependencia Redis/Upstash; no se contrató ningún servicio.
- Pruebas unitarias básicas escritas en `tests/gemini-audit.test.cjs`, aún sin ejecución verificada.
- Sin llamada real a Gemini, sin interfaz de usuario, sin despliegue a producción y sin validación de cuotas del modelo.
