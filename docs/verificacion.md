# Verificación — 3 de octubre de 2026

- Chromium: portada, foro, trece temáticas, integrantes, ingreso, registro hasta el segundo paso sin enviar correo y acceso anónimo denegado a moderación; sin errores de JavaScript.
- Vista móvil de 390 px: categorías sin desbordamiento horizontal.
- Apertura de publicación: vista enfocada y formulario de respuesta. Temática específica sin bienvenida ni botón de Temáticas y con enlaces institucionales.
- FlightPrep: exportaciones JSON y generación de PDF por impresión comprobadas en navegador.
- `node tests/utilities.test.cjs`: viento frontal/cruzado, navegación sin viento, llegada después de medianoche, viento que impide la navegación, distancia negativa, escape de textos, centro de gravedad y exceso de peso.
- Supabase: prueba transaccional de RLS y triggers con dos usuarios temporales, revertida íntegramente. Denegación de autoaprobación y escalamiento de rol, aprobación por moderador, sanciones reservadas al administrador, primeras contribuciones pendientes, reportes duplicados rechazados, privacidad del historial y contenido pendiente.
- Auditoría de moderación de CompraVenta verificada en transacción revertida, incluyendo notificación al autor.
- Sintaxis de JavaScript verificada para todos los archivos activos.

## Límites de la comprobación

Google está deshabilitado en el proyecto Supabase; no se habilitó un proveedor sin sus credenciales. El registro por correo está habilitado y requiere confirmación. No se enviaron correos de prueba ni se validó la entrega de correo o el retorno de OAuth con una cuenta real.

El asesor de Supabase no indicó nuevas tablas públicas sin RLS. Señaló tres tablas internas con denegación por defecto intencional y la configuración preexistente de [protección de contraseñas filtradas deshabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Las calculadoras siguen un modelo orientativo con valores ingresados por el usuario. Peso y Balance no contiene una base certificada de aeronaves ni sustituye la envolvente real del manual.
