# AeroMeteo · Gente de Vuelo

**Estado:** desarrollo en rama de pruebas. No fusionar con `main` ni publicar en Vercel sin autorización expresa.

## Aplicación
`utilidades/aerometeo.html` — aplicación meteorológica independiente, navegación satelital, pantalla grande y panel lateral, con acceso desde AeroLocator y Utilidades.

**Capas y fuentes:**
- **3D-PAWS / CHORDS:** catálogo inicial de siete ubicaciones reales, tres pertenecientes a clubes de planeadores. Cada estación consulta bajo demanda `/api/aerolocator-weather-stations?id=...`. Se normalizan m/s a kt, fecha UTC y antigüedad; si no existe medición válida, no se inventan valores. Fuente pública de catálogo: https://3d-argentina.icdp.ucar.edu/instruments. Endpoint de descarga documentado en CHORDS: `/api/v1/data/{instrument_id}.geojson?last`.
- **Open-Meteo:** consulta puntualmente bajo demanda `/api/aerolocator-open-meteo?lat=...&lon=...`. Respuesta de modelo no equivale a observación meteorológica ni METAR; valores en nudos, horario UTC y estado del modelo. Caché y controles de volumen.
- **Servicio Meteorológico Nacional:** enlaces directos a observaciones, radares, modelos WRF, PRONAREA, METAR y TAF. No se copia ni redistribuye el catálogo antiguo como lectura actual.
- **Aviation Weather Center:** consulta puntual por aeródromo OACI argentino `/api/aerometeo-aviation-weather?icao=SAAV&type=metar` o `taf`; reproduce mensajes originales, advierte fecha desconocida o desactualizada.

**Antes de autorizar publicación:** revisar funcionamiento real desde navegador y respuesta externa de cada API; comprobar permisos/licencias para reutilización; verificar la correcta ubicación de las siete estaciones. Las pruebas unitarias incluyen respuestas simuladas, pero **no prueban la conectividad viva** con 3D-PAWS, Open-Meteo o AWC.

## Licencias y límites
La API gratuita de **Open-Meteo** exige uso *no comercial* y atribución CC BY 4.0. Open-Meteo aclara que una herramienta gratuita también puede considerarse comercial cuando apoya un negocio o producto pago, por lo que integrar AeroMeteo junto a AeroSuite exige revisión previa. **No suscribir ni contratar servicios pagos automáticamente**. Ver https://open-meteo.com/en/terms.

Los datos de CHORDS requieren confirmar permisos de reproducción al publicar. Los accesos del SMN son enlaces a información oficial, no una API en vivo integrada.

Los datos aquí reunidos son informativos y no sustituyen información meteorológica aeronáutica operacional, NOTAM, AIP ni la decisión del piloto al mando.

## Pruebas
```sh
node --test tests/aerolocator-weather-stations.test.cjs
node --test tests/aerometeo-app.test.cjs
node --test tests/aerolocator-navaids-layer.test.cjs
node --test tests/aerolocator-openaip-layers.test.cjs
```
