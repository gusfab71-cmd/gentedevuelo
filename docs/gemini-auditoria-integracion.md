# Integración Gemini — Revisión de nuevas aplicaciones de Gente de Vuelo

**Estado: implementada en rama de pruebas. No habilitada en producción.** Flight Operations queda expresamente fuera del alcance.

## Objetivo

ChatGPT desarrolla y prueba nuevas aplicaciones. Gemini realiza una segunda revisión técnica independiente. ChatGPT analiza los hallazgos y propone correcciones verificables; ninguna sugerencia se aplica ni se publica automáticamente.

## Diseño

- Panel aislado en `/auditoria-codigo.html`, sin ningún enlace ni cambio en Flight Operations.
- Endpoint Vercel `/api/gemini-code-review` protegido por Supabase Auth y consulta `site_admins` bajo RLS.
- El administrador selecciona y pega el diff/código, revisa sus datos y autoriza cada envío a Google Gemini.
- Máximo 16 KB por solicitud y 12.000 caracteres de código. Filtro de patrones comunes de claves y contraseñas. **No garantiza detectar todo dato confidencial**; la revisión humana es obligatoria.
- Máximo una solicitud cada cinco minutos y cinco por día, **por instancia**. El control no es distribuido, por lo que el gasto/cuota real debe limitarse en Google AI Studio.
- Clave API solamente en el servidor, respuestas como texto plano, sin publicación ni edición automática.
- El prototipo de Gemini dedicado a ejercicios ficticios de vuelo fue retirado de esta rama.

## Activación, pendiente de autorización específica

1. Confirmar en Google AI Studio que `gemini-2.5-flash` tiene cuota API libre para ese proyecto y controles para evitar cargos. La suscripción Gemini Pro no equivale a cuota API ilimitada.
2. Mantener `GEMINI_API_KEY` únicamente como secreto de Vercel; no introducirlo en GitHub ni en el navegador.
3. Para una primera prueba en Preview solamente, establecer `GEMINI_CODE_REVIEW_ENABLED=true` en ese entorno, tras aprobación del administrador. El nombre sustituye al antiguo `GEMINI_AUDIT_ENABLED`.
4. Ingresar como administrador a `/auditoria-codigo.html` y enviar un diff ficticio sin secretos. Verificar respuesta, o errores de cuota/modelo/clave, con logs privados del despliegue.
5. Examinar revisión y pruebas automáticas antes de considerar fusionar el PR con `main`.

**Las pruebas locales son simuladas y no llaman a Google:**

`node --test tests/gemini-code-review.test.cjs`
