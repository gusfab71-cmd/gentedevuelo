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
