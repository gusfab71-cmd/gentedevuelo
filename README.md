# Gente de Vuelo

Sitio estático con foro conectado al proyecto existente de Supabase.

## Probar en local

Desde la carpeta del repositorio:

```sh
python -m http.server 8000
```

Abrir http://localhost:8000. El foro vive en `comunidad.html`; las herramientas están en `utilidades/`. Se necesita conexión para autenticación, datos, medios y los servicios de Supabase. No se requiere compilación.

La configuración pública está en `assets/community-config.js`. Nunca colocar claves secretas o `service_role` en el frontend. La función de ingreso por usuario admite el origen de GitHub Pages y localhost. Google figura deshabilitado en la configuración actual de Auth: el botón muestra ese estado. El registro por correo está habilitado y requiere confirmación. Los enlaces por correo dependen de los destinos permitidos en Auth; la prueba completa de entrega de correo debe hacerse con una cuenta propia.

## Base de datos

La migración de `supabase/migrations/` amplía el esquema existente; no es una instalación desde cero. La migración de consolidación fue aplicada al proyecto. `supabase/tests/community_permissions.sql` comprueba permisos y revierte todos sus datos de prueba mediante `ROLLBACK`.

La carpeta `revision-comunidad/` se conserva como versión histórica. La versión consolidada se sirve desde la raíz. No se configuraron dominios ni plataformas externas de hosting.

Diseño y reglas: `docs/arquitectura-comunidad.md`.

## Acceso y utilidades (octubre de 2026)

`assets/auth-guard.js` comparte un único cliente Auth por página. Consulta `getSession()` y valida la cuenta con `getUser()` antes de mostrar las secciones; una sesión de cuenta eliminada se descarta localmente. Ingreso, registro, recuperación y normativa son rutas públicas. Los enlaces privados vuelven al destino solicitado después del ingreso. Las páginas históricas redirigen a las actuales. Este control de navegación no reemplaza las políticas RLS de la base de datos.

La URL de recuperación se deriva de la raíz del sitio (`index.html`), también cuando se solicita desde una subcarpeta. En producción es `https://gusfab71-cmd.github.io/gentedevuelo/index.html`; debe estar autorizada en Supabase Auth. No hay bloqueos específicos por correo en el frontend.

`utilidades/calculo-sustentacion.html` contiene el simulador NACA provisto, junto a FlightPrep NAV y Peso y Balance. Los colores de las 13 temáticas se fijan en `assets/comunidad.js` según la paleta solicitada, sin modificar registros de Supabase.

Pruebas: `node tests/auth-guard.test.cjs` y `node tests/utilities.test.cjs`. La navegación, la recuperación y el simulador también se comprobaron en un DOM con respuestas Auth simuladas; no se realizó una prueba de entrega de correo ni una revisión visual en navegador.
