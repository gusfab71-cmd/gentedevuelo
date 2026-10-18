# Integración Gemini — Revisión de nuevas aplicaciones de Gente de Vuelo

**Estado: implementada en rama de pruebas. No habilitada en producción.** Flight Operations queda expresamente fuera del alcance.

## Objetivo

ChatGPT desarrolla y prueba nuevas aplicaciones. Gemini realiza una segunda revisión técnica independiente. ChatGPT analiza los hallazgos y propone correcciones verificables; ninguna sugerencia se aplica ni se publica automáticamente.

## Diseño

- **Auditoría automática de nuevos desarrollos:** al abrir o actualizar un Pull Request del mismo repositorio, GitHub Actions puede enviar su diff a Gemini y publicar una única evaluación actualizable en el PR. ChatGPT lee esa evaluación, decide qué observaciones corresponde corregir y conserva la dirección técnica del proyecto.
- El workflow usa el script desde la **rama base de confianza**, nunca ejecuta código de la propuesta. No se entrega el secreto a PRs desde forks.
- Filtra `utilidades/meteorologia-aeronautica.html` y todos los archivos de Flight Operations identificados por ruta; los PRs con solo esos cambios no generan llamadas a Gemini.
- Envía solo fragmentos de texto de archivos de código (máximo 9.500 caracteres), avisa si la revisión fue parcial y bloquea un envío cuando detecta patrones de claves.
- El flujo automático está **desactivado por defecto**. Para habilitarlo después de verificar la cuota de Gemini se necesitan el secreto GitHub Actions `GEMINI_API_KEY` y la variable de repositorio `GEMINI_PR_REVIEW_ENABLED=true`. Ninguno está incluido en el código.
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

Para la auditoría automática se configura la clave en **GitHub → Settings → Secrets and variables → Actions → Repository secrets**, no en el código. La activación se hace mediante una **Repository variable** denominada `GEMINI_PR_REVIEW_ENABLED` con valor `true`. No alcanza con la clave que ya esté guardada en Vercel: son entornos separados.

**Las pruebas locales son simuladas y no llaman a Google:**

`node --test tests/gemini-code-review.test.cjs`

`node tests/gemini-pr-review.test.cjs`
