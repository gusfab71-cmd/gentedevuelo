# Caja de Ideas de AeroSuite — Documento Maestro

**Actualizado:** 25/10/2026  ·  **Proyecto:** AeroSuite, By Gente de Vuelo

Este es el registro central de las decisiones, ideas y pendientes tratados para AeroSuite. No implica que todos los módulos estén publicados o habilitados.

## 0. Criterio de mantenimiento de la caja

- **Corte consolidado: 25 de octubre de 2026.** Registro del proyecto AeroSuite · By Gente de Vuelo. Mantener aquí las decisiones, ideas, referencias y pendientes con etiquetas: APROBADO / PROVISIONAL / IMPLEMENTADO EN CÓDIGO / PENDIENTE / REFERENCIA EXTERNA.

- Una funcionalidad codificada no debe considerarse publicada sin despliegue exitoso y prueba de usuario. Algunos despliegues de octubre fueron bloqueados por límites de Vercel. No confundir demo de administrador con cuentas institucionales reales.

- El anexo [Comercialización, tarifas y período de prueba](IDEAS-seguimiento-aeronaves.md) es la fuente detallada del esquema de precios provisional.

## 1. Visión, marca e integración con Gente de Vuelo

- **APROBADO:** el nombre del producto es **AeroSuite** con firma **By Gente de Vuelo**. Su identidad: A aerodinámica, colores azul aeronáutico/plata, base azul oscuro, estilo moderno y premium. Verificación legal de marca/dominio pendiente.

- **APROBADO:** AeroSuite es una extensión integral de la comunidad Gente de Vuelo, dirigida a escuelas de vuelo, aeroclubes, alumnos, instructores y pilotos. Sencillez de uso, resultados útiles, seguridad y datos aeronáuticos confiables.

- **APROBADO:** una única cuenta de Gente de Vuelo para registrarse en AeroSuite; la participación comercial de una escuela no debe convertir en pagado el acceso básico a la comunidad.

- **APROBADO:** tres áreas diferenciadas: Formación del Alumno, Instrucción/Jefatura y Gestión Administrativa, con módulos compartidos y permisos separados.

- **APROBADO:** la portada Gente de Vuelo lleva a la **pantalla de presentación de AeroSuite**, y el botón de esta lleva a la **demo del portal**. Desde presentación y portal se puede volver al Inicio de Gente de Vuelo. Demo operativa solo admin por ahora.

- **DISEÑO:** foto de aeronave claramente apoyada en la pista, texto de portada situado arriba sin taparla. Paleta azul, gris carbón, plata y dorado moderado. Afiche vertical 9:16 que anuncie «PRÓXIMAMENTE», AeroSuite y las áreas Formación/Instrucción/Gestión.

## 2. Comercialización — decisión actual

- **APROBADO COMO TARIFARIO PROVISIONAL (25/10/2026):** adoptar **por ahora la estructura e importes aportados de Airnizer** como esquema de comercialización de AeroSuite, sujetos a revisiones posteriores. No son cobros efectivamente activados.

- **Plan para escuela/aeroclub:** Módulo Empresa **ARS 60.000/mes** (fijo) + **ARS 10.500/mes por aeronave afectada** + **ARS 3.650/mes por usuario afectado**. Confirmar antes de facturar criterios de usuarios, vehículos incluidos, impuestos, titularidad y bonificaciones.

- **Seguimiento individual separado:** **1 aeronave gratis** para el piloto/propietario particular; **desde la segunda ARS 10.500/mes por aeronave adicional**. Verificar si el beneficio de una aeronave gratis aplica también al paquete institucional: **NO asumir que los dos esquemas se acumulan**.

- **APROBADO:** cada escuela dispondrá de **un mes de prueba gratuito**, sin tarjeta de crédito obligatoria y sin transformación/cobro automático al vencer. Avisos sugeridos a 7 y 2 días; contratar voluntariamente al concluir; conservación y exportación de registros, sin borrado inmediato.

- **PENDIENTE:** definir si un mes equivale a mes calendario o 30 días; calendario de activación, límites de prueba, funciones costosas de IA, actualización de aranceles, Essential/Pro, descuentos por institución, condiciones de cobro y post-vencimiento.

- **A EXPLORAR:** edición **Free Community** autohospedada sin costo para escuela/aeroclub que administre su infraestructura; opciones Essential/Pro en nube. Licencia gratuita no significa automáticamente código abierto. Estos planes futuros no sustituyen el tarifario provisional sin nueva decisión.

- **PENDIENTE FISCAL:** alta y actividad ante ARCA (ex AFIP), CUIT, Monotributo o Régimen General según situación, comprobantes electrónicos y tributos provinciales (p. ej. ARBA/Convenio Multilateral). Pasarela de pago, impuestos, términos de servicio, privacidad y suscripciones todavía no implementados.

- **REFERENCIA COMPETITIVA:** los precios fueron aportados por el usuario a través de capturas/explicaciones de Airnizer; no están verificados como cotización oficial vigente. Más detalles en el anexo comercial.

## 3. Investigación, encuestas y análisis de competencia

- **EN CURSO:** recolectar y analizar encuestas a escuelas y aeroclubes (incluidas respuestas de Ensenada y otras instituciones aportadas por usuario). Comparar número de alumnos, flota, administración, reservas, operaciones y necesidades reales.

- **PENDIENTE:** análisis FODA y matriz funcional de competidores, especialmente Airnizer, Aeros Gestión y plataformas similares; contrastar tarifas, flujos, soporte y carencias antes de posicionar comercialmente AeroSuite.

- **IDEA:** diferenciarse por experiencia simple, conexión con comunidad aeronáutica, formación original, planificación meteorológica, seguimiento académico, mantenimiento y operación unificados.

- **A EVALUAR:** modelos de costo para escuelas pequeñas, medianas y grandes; comparar cargas por aeronave y por usuario, evitando desincentivar el registro de alumnos.

## 4. Registro integrado, documentación y roles

- **APROBADO:** quien se registra en Gente de Vuelo puede ampliar datos para participar en AeroSuite como **Alumno, Instructor y/o Piloto**, uno o varios; **foto NO obligatoria**.

- **Datos personales ampliados:** nombre, apellido, país y fecha de nacimiento; al menos un documento (tipo, número, país emisor y vencimiento si corresponde); residencia (país, provincia, ciudad, dirección, código postal); teléfono móvil requerido; fijo y otros teléfonos opcionales; correo de la cuenta en solo lectura.

- **Datos propios por perfil:** alumno: curso/especialidad de interés; instructor: licencia/habilitación y número declarado, institución/base opcionales; piloto: licencia y número declarados, base y horas opcionales.

- **SEGURIDAD OBLIGATORIA:** autodeclararse instructor o piloto NO acredita credenciales ni permite entrar a legajos ajenos. Institución, matrícula, alumnos asignados y permisos deben verificarse y autorizarse por separado.

- **CODIFICADO, PRUEBA REAL PENDIENTE:** perfiles/documentos privados, declaraciones de rol, Supabase/RLS y bucket privado para foto opcional. No publicar datos personales en Mi Hangar/comunidad. Distinguir documento registrado de documento verificado.

- **PENDIENTE:** usuarios pertenecientes a varias escuelas, inscripción y autorización institucional, invitación/revocación de roles y auditoría de cambios.

## 5. Formación del Alumno / Academia

- **APROBADO:** biblioteca de formación aeronáutica original, con **30 fichas teóricas** y **8 de CRM (Crew Resource Management)**; gráficos aeronaúticos realistas, infografías verticales, alta resolución, información precisa y legible, encabezado y logo AeroSuite/Gente de Vuelo.

- **APROBADO:** biblioteca en storage propio **Cloudflare R2 / Supabase**, no depender de Google Drive; administración reemplaza PDFs completos y agrega materias; límite solicitado para fichas **100 MB por PDF** y conservación del anterior si falla la sustitución.

- **APROBADO:** Simu de Examen PPA basado en materiales ANAC aportados, preguntas aleatorias, opciones múltiples, 1 punto por acierto, explicación fundamentada y revisión técnica obligatoria. Durante prototipo solo admin.

- **CODIFICADO EN ACADEMIA DEL ALUMNO:** accesos funcionales a **Rodaje con viento**, **Cálculo de Sustentación** y **Mantenimiento de aeronaves** retirados como tarjetas independientes de Utilidades. Reutilizar apps originales mediante visor o apertura completa. No borrar sus archivos ni bitácoras.

- **CODIFICADO:** FlightPrep NAV retirado como tarjeta independiente; planificación consolidada en Flight Operations dentro de AeroSuite, sin suprimir archivo histórico ni rutas.

- **PENDIENTE:** actividades asignables por instructor, progreso, notas, evaluaciones, observaciones, evidencias, versiones imprimibles e interactivas. La lectura de fichas no se considera automáticamente hora académica acreditada.

- **REFERENCIA DOCUMENTAL INTERNA:** manual teórico aeronáutico previamente compartido se usa solo como consulta para ideas; generar texto y gráficos originales, no copiar contenido protegido ni identificar la fuente públicamente cuando no sea exigible por atribución.

## 6. Instrucción y Jefatura

- **APROBADO:** vista específica de instructor/jefe con alumnos asignados, planes de clase, registros de vuelos, horas, asistencia, evaluaciones, correcciones y seguimiento.

- **PENDIENTE:** reglas y autorizaciones por institución, revisión/aprobación del jefe, registros RAV, régimen CIAC y no CIAC cuando corresponda, trazabilidad de firmas/cambios y notificaciones.

- **APROBADO:** Flight Operations accesible también desde Instrucción, con interfaz formativa sin IA, incluso si el administrador simula el rol.

## 7. Flight Operations — planificación de vuelo

- **APROBADO:** aplicativo compartido de Alumno e Instructor y de la comunidad Gente de Vuelo, sin duplicar fuentes ni base. Reportes de prevuelo y navegación.

- **Flujo deseado de cinco etapas:** (1) datos del vuelo: UTC, origen/destino/alternativo OACI, VFR/IFR; (2) piernas, puntos editables, CV/CD/RV/Var/DM/RM/NM; (3) boletines METAR/TAF/SIGMET/PRONAREA manual/NOTAM; (4) TAS, altitud por pierna, viento, GS, ETE/ETA, litros y reservas editables; (5) informe esencial de riesgos y compatibilidad temporal.

- **SEGURIDAD:** boletines con emisión/vigencia y fuente; nunca inventar datos ni equiparar informes educativos a un despacho oficial. Reglas VFR por pierna cuando correspondan; validar PRONAREA vigente antes de IA.

- **APROBADO:** IA solo administración en primera etapa; autorizaciones de tokens; Vista Alumno/Instructor sin IA.

- **PENDIENTE:** sugerencia automática de piernas/alternativos, búsqueda por nombre/lat-long, FIR automática, mejoras SIGMET, contador de tokens, informe impreso unificado y revisión/corrección pedagógica por instructor.

## 8. AeroLocator — geolocalización y pistas

- **NOMBRE APROBADO:** AeroLocator; mapa integrado en Gente de Vuelo y AeroSuite. Mantener URL histórica de pistas-no-oficiales para no romper enlaces.

- **APROBADO:** seis clases: aeropuertos públicos controlados, aeródromos públicos no controlados, aeródromos privados registrados, LAD, helipuertos/helipuntos, pistas no oficiales/sin verificar. Las referencias OpenStreetMap no implican habilitación ANAC.

- **APROBADO:** PC con pantalla dividida, panel lateral 25–30 % y mapa amplio; filtros superficie (asfalto, tierra, césped), ATS, acceso, VFR/IFR; pines profesionales por categoría, ficha lateral con medidas, orientación, elevación, obstáculos, observaciones y fotos aprobadas.

- **APROBADO:** Leaflet con zoom y cambio satélite/calles; busca ciudad mediante Nominatim a demanda (sin autocompletado con servicio público), coordenadas o pistas registradas; flyTo, cache y control global de peticiones.

- **APROBADO:** regla de distancia NM y rumbo **verdadero inicial**, sin confundir rumbo magnético; pin de aporte por clic/pulsación larga; moderación de propuestas y fotos R2 antes de publicación.

- **SEGURIDAD:** pista no verificada marcada con alerta severa, exclusivamente referencia para análisis de contingencias; no afirmar aptitud ni autorización. METAR cercano de estación identificada (no METAR inventado de pista informal), AIP/ANAC y NOTAM con fecha y fuente.

- **PENDIENTE:** ampliar/verificar catálogo nacional, permisos, cambios de clasificación con evidencia oficial, comprobar cargas de foto reales y test de mapa en PC/celular.

## 9. Gestión Administrativa, flota y mantenimiento

- **APROBADO:** gestión de aeronaves, agenda, reserva, alumno/instructor, registro de vuelos, RAV según responsabilidades, finanzas, combustible/aceite, stock, documentos y vencimientos.

- **APROBADO:** mantenimiento por motor, fuselaje, hélice, intervenciones, aceite y filtros, revisiones, inspecciones por horas/ciclos/calendario, directivas aplicables, respaldo documental y reportes; umbrales técnicos configurables según aeronave y normativa.

- **SEGURIDAD:** información de mantenimiento privada y con trazabilidad; mover el acceso entre módulos no debe perder los registros. Implementar roles por institución y usuarios autorizados.

- **IDEA:** modelo por flota y usuario, con precio provisional registrado en comercialización; propietario y escuela pueden compartir referencia a aeronave sin duplicarla ni facturar dos veces por error.

## 10. Experiencia visual, comunicación y navegación

- **DECIDIDO:** estructura estética premium azul aeronáutico/gris carbón y tipografía legible, responsiva. Presentación AeroSuite con avión sobre la pista y titulares ubicados arriba para no tapar el avión.

- **DECIDIDO:** acceso del admin desde portada Gente de Vuelo como AeroSuite, con herramientas comunitarias disponibles al resto. Del menú a la presentación, no directo a demo. Botón «Ingresar a la demo» y regresos a Gente de Vuelo.

- **MATERIAL:** afiche AeroSuite «PRÓXIMAMENTE» formato 9:16 para publicación en portada de Gente de Vuelo, formación/instrucción/gestión, avión realista. No confundir imagen diseñada con inserción efectiva en sitio.

- **APROBADO:** separar datos reales de ejemplos «DEMO», evitar solapamientos y priorizar facilidad de uso para piloto/escuela en PC y celular.

## 11. Infraestructura, seguridad y estado de implementación

- **Arquitectura existente:** repositorio GitHub Gente de Vuelo, Supabase Auth/Postgres/RLS, Cloudflare R2 para multimedia/PDF aplicables, Vercel para despliegue del sitio.

- **NO HACER:** crear perfiles institucionales inseguros, divulgar documentos/credenciales/EXIF, borrar registros por cambiar un menú, fusionar datos de alumnos entre escuelas, publicar pistas comunitarias como oficiales, usar fotos comunitarias sin autorización.

- **PENDIENTE:** verificación de permisos multi-escuela, ensayos de registro/fotos, backups/exportaciones, integración de cobro/factura, auditorías, escalabilidad y pruebas reales con escuelas piloto.

- **ESTADO EL 25/10/2026:** varios cambios de código y pruebas automáticas en GitHub se completaron, pero algunos despliegues de Vercel fallaron por límite de frecuencia (build-rate-limit). No decir «ya publicado» si no se confirmó despliegue posterior.

- **SEGUIMIENTO:** actualizar cada decisión comercial, función y resultado de encuesta aquí, dejando fecha, motivo, alcance, cambios sobre decisiones anteriores y estado verificable. El archivo IDEAS-seguimiento-aeronaves.md conserva detalle del modelo económico.
