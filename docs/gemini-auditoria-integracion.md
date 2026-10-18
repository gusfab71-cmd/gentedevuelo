# Integración Gemini — Auditoría técnica

Estado: **implementación en rama de prueba, desactivada por defecto**. No se ha validado aún una llamada real con la clave de Google ni se ha publicado a producción.

## Propósito
Gemini actúa como revisor independiente de los cálculos de Flight Operations. No decide ni cambia datos de vuelo, no publica modificaciones y no sustituye la verificación del piloto.

## Arquitectura prevista
1. En la etapa final de Flight Operations, el administrador elige un ejercicio **sintético** de IAS→TAS, viento/GS o combustible y autoriza una consulta.
2. Función de servidor Vercel verifica el token de sesión con Supabase Auth y consulta el rol de administrador mediante una comprobación segura en el servidor.
3. La función acepta **únicamente** el identificador de uno de tres ejercicios fijos. Los datos se construyen en el servidor; no se reciben prompts libres ni planes de vuelo de los usuarios.
4. La función llama a Gemini API con `process.env.GEMINI_API_KEY`, nunca desde código público ni mediante variables con prefijo `VITE_`/`NEXT_PUBLIC_`.
5. Devuelve observaciones orientativas, sin guardar secretos ni datos personales. Un control por instancia impide repetir la consulta por usuario antes de 60 segundos; no reemplaza los límites del proyecto Google.

**No implementar un endpoint público sin autorización comprobada en el servidor.** Ocultar un botón no es control de acceso.

## Alcance inicial
- Auditar IAS, TAS, GS, viento/deriva, rumbos y combustible usando tres casos sintéticos de ejemplo.
- Comparar contra cálculos determinísticos y pruebas automatizadas; la IA no constituye una referencia certificada.
- No enviar registros de usuarios, datos de autenticación, claves, archivos privados ni planes de vuelo reales al nivel gratuito sin evaluar las condiciones de tratamiento de datos.
- No modificar lógica existente de Flight Operations ni Supabase.
- Mantener toda salida de Gemini como sugerencia sujeta a revisión humana.

## Preparación y seguridad
- Variable de entorno de Vercel: `GEMINI_API_KEY` (Secret, únicamente servidor). El usuario indicó que la guardó en Production; su presencia y funcionamiento **no se han verificado**.
- Variable `GEMINI_AUDIT_ENABLED=true`: habilitación explícita, ausente por defecto. La función devuelve `503` si falta la clave o el interruptor.
- Modelo del prototipo: `gemini-2.5-flash`. Confirmar en Google AI Studio que el proyecto puede utilizarlo y conocer su cuota real. Si la clave pertenece a un proyecto nuevo sin acceso a ese modelo, actualizar tras verificar modelos disponibles.
- Antes de activar, establecer límites del proyecto Gemini en Google AI Studio. La espera en memoria de Vercel es una defensa adicional, **no un límite global garantizado** en el servicio distribuido.
- Considerar que las variables agregadas en Vercel pueden requerir un nuevo despliegue para aplicarse.
- Confirmar configuración de autenticación, rol admin, límites de Google y medidas antiabuso antes de activar la función.
- No agregar nunca el valor de la clave a GitHub, logs, capturas ni chat.

## Criterios de aceptación para la implementación futura
- Petición sin sesión o con usuario no administrador: rechazada.
- Petición válida: auditoría sin datos sensibles, respetando las cuotas gratuitas de Google; evaluar controles antiabuso antes de habilitar.
- Error de Gemini o cuota agotada: error controlado, sin bloquear Flight Operations.
- No se modifica ni se publica ningún cálculo automáticamente.
- Pruebas locales con respuestas simuladas y prueba en Preview con sesión de administrador antes de integrar a `main`.

## Estado de implementación (2026-10-18)
- Función en `api/gemini-audit.js`, **desactivada** salvo que `GEMINI_AUDIT_ENABLED=true` y exista `GEMINI_API_KEY`.
- Panel exclusivo de administración en etapa 5, con consentimiento individual; código independiente de la navegación y del informe esencial.
- En el servidor se comprueban sesión y membresía de `site_admins` protegida por RLS. Las pruebas comprueban rechazo de anónimos/no administradores y de contenido libre.
- Se retiró la dependencia Redis/Upstash; no se contrató ningún servicio.
- Pruebas unitarias de `tests/gemini-audit.test.cjs` sin llamadas reales a Google: `node tests/gemini-audit.test.cjs`.
- No se han hecho llamadas reales a Gemini ni confirmado la cuota del modelo. La interfaz no introduce ni transmite los datos verdaderos del vuelo.
