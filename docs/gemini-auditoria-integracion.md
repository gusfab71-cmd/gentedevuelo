# Integración Gemini — Auditoría de nuevas aplicaciones de Gente de Vuelo

Estado: **diseño corregido; integración general pendiente de implementar y probar**. No habilitada en producción.

## Objetivo acordado
ChatGPT desarrolla y modifica nuevas aplicaciones. Gemini ofrece una segunda revisión técnica independiente del código y de las pruebas. ChatGPT evalúa las observaciones y propone correcciones. Ninguna sugerencia se aplica automáticamente.

**Flight Operations queda expresamente fuera del alcance.** No incorporar paneles ni llamadas a Gemini en ninguna etapa de Flight Operations.

## Arquitectura prevista
1. Herramienta administrativa independiente del sitio público, dedicada a proyectos de desarrollo.
2. Entrada: código o diffs seleccionados por el administrador, con secretos y datos personales excluidos.
3. Un endpoint de servidor en Vercel verifica sesión y rol administrador antes de aceptar solicitudes.
4. La clave `GEMINI_API_KEY` permanece exclusivamente en el servidor. No exponerla en el navegador, GitHub, logs ni respuestas.
5. Gemini revisa defectos, seguridad, accesibilidad, compatibilidad y pruebas. Devuelve hallazgos concretos, nivel de severidad y sugerencias verificables.
6. ChatGPT revisa los hallazgos; solo cambios expresamente autorizados pasan a GitHub, inicialmente en rama separada con pruebas.
7. Límites de entrada, tiempo de ejecución, consumo y frecuencia, y controles contra abuso antes de habilitar llamadas reales.

## Estado del prototipo anterior
- `api/gemini-audit.js` es un prototipo **limitado a tres ejercicios aeronáuticos ficticios**, no un auditor de código. Sigue deshabilitado mediante `GEMINI_AUDIT_ENABLED` y **no debe habilitarse ni desplegarse como integración general**.
- `assets/gemini-audit-panel.js` y `assets/gemini-audit.css` corresponden a un panel para Flight Operations. Son **obsoletos para el nuevo objetivo** y deben eliminarse o sustituirse antes de cualquier integración a `main`.
- Las pruebas actuales solo validan aspectos básicos del prototipo anterior. **No verifican la comunicación real con Gemini**.
- La suscripción Gemini Pro del usuario no equivale a cuota API ilimitada. Confirmar disponibilidad y límites de la API gratuita antes de realizar llamadas.
- No se ha verificado una llamada real con la clave configurada en Vercel.

## Requisitos de aceptación
- No se modifica Flight Operations.
- Auditoría independiente y limitada a administradores.
- Sin datos sensibles, claves ni información privada de usuarios enviada a Gemini.
- Sin cargos inesperados: consultar cuota disponible, establecer controles y solicitar autorización antes de activar.
- Manejo explícito de errores de credenciales, modelo, cuota, tiempos de espera y respuestas vacías.
- Pruebas automatizadas y despliegue Preview antes de considerar producción.
- La auditoría no edita ni publica código por sí sola.

## Próximos pasos
1. Retirar el panel antiguo y los ejercicios de Flight Operations de la rama de preparación.
2. Implementar un endpoint específico para revisión de código con autorización, validación de entradas y límites de uso.
3. Agregar pruebas de seguridad, cuota y errores con respuestas simuladas.
4. Verificar la API de Gemini en Preview, sin activar producción.
5. Solicitar aprobación antes de fusionar la rama.
