# AeroSuite — Análisis competitivo: GestiónAero y Aeros Gestión

**Fecha de investigación:** 25/10/2026.
**Tipo de información:** revisión de páginas públicas de proveedores; características anunciadas, no necesariamente probadas en producción. No se accedió a portales privados ni a cuentas de clientes.
**Estado:** investigación incorporada a la Caja de Ideas; observaciones y recomendaciones **pendientes de evaluación**, sin alterar tarifas o módulos de AeroSuite.

## 1. Identificación: son DOS proveedores diferentes

1. **GestiónAero** — [gestionaero.com.ar](https://gestionaero.com.ar/). Se presenta como sistema SaaS integral de aeroclubes argentinos; sitio comercial identifica como desarrollador a HOLAMUNDO SRL.
2. **Aeros Gestión** — [aeros.com.ar/web/](https://aeros.com.ar/web/). Producto vinculado a Oro Verde Digital SRL; incluye Aeros SED para educación a distancia y beneficio Aeros Base para socios de FADA.

No confundir **GestiónAero**, **Aeros Gestión**, **Airnizer** ni **AeroSuite**. Conviene hacer seguimiento de los tres competidores por separado.

## 2. GestiónAero: procesos administrativos anunciados

**Fuente primaria:** https://gestionaero.com.ar/ (consulta 25/10/2026).

| Proceso | Qué informa GestiónAero | Qué debe comprobar AeroSuite en su propia implementación |
|---|---|---|
| Reservas | Calendario en tiempo real, disponibilidad, confirmación y verificación de habilitación antes de reservar | Recursos y restricciones por aeronave/instructor, conflictos, bloqueos, cancelaciones, permisos |
| Registro de vuelos | Vuelo individual, horas automáticas por piloto y aeronave, RAV en PDF | Modelo único reserva→vuelo→aprobación→horas→RAV; cotejo del PDF contra normativa vigente |
| Aeronaves | Disponibilidad, vencimientos de servicio, mantenimiento y seguros | Estado técnico auditado, intervalos propios del modelo, mantenimiento y restricciones |
| Personas | Socios y pilotos con usuario, permisos, licencias/vencimientos, historial, cuenta corriente | Alumno/instructor/piloto con cuenta Gente de Vuelo más matrícula y acceso institucional verificado |
| Contabilidad | Ingresos/egresos, categorías, varias cajas, cheques, proveedores y balances | Modelos contables y obligaciones fiscales; trazabilidad e integración con reservas/vuelos |
| Combustible/aceite | Entradas, cargas, proveedores, costo y precio por litro, mínimos | Libro de movimientos, conciliación, stock y alerta de reposición |
| Avisos | Email, y WhatsApp en plan específico; vencimientos, cambios, stock | Consentimientos y costos; plantillas auditables, deduplicación y avisos de seguridad |
| Salón/predio | Reservas de espacios de club, consulta pública de disponibilidad | Módulo optativo de instalaciones/recursos para aeroclubes |
| Soporte multi-tenant | Panel superadmin, organizaciones aisladas | Aislamiento fuerte con RLS, administración por escuela y registro de auditoría |

**Alta informada por el proveedor:** institución envía nombre y datos; proveedor habilita al administrador; la institución carga aviones y personas y pone en marcha la operación. El sitio anuncia activación en menos de 24 h y configuración sencilla. **No se comprobó el tiempo real de onboarding.**

**Precisión normativa:** GestiónAero afirma generar RAV ANAC en formato oficial. Es **declaración del proveedor**, no validación independiente; en AeroSuite se deberá comprobar el formato contra las fuentes oficiales actuales.

## 3. GestiónAero: precios y prueba publicados

**Fuente:** https://gestionaero.com.ar/ , sección Precios y FAQ (25/10/2026).

| Oferta del competidor | Precio informado | Alcance que publica |
|---|---:|---|
| Prueba | Gratis, **30 días** | Sin tarjeta, módulos completos, usuarios y aeronaves ilimitados |
| Plan Full | **ARS 60.000/mes + IVA** | Todos los módulos, **usuarios y aeronaves ilimitados**, email, RAV, alertas, soporte prioritario |
| Plan WhatsApp | **ARS 80.000/mes + IVA** | Full más avisos WhatsApp de reservas/vencimientos/stock |

**Este hallazgo cambia el análisis de precio:** el esquema provisional adoptado por AeroSuite tomando como referencia Airnizer tiene **ARS 60.000/mes base + ARS 10.500/mes por aeronave afectada + ARS 3.650/mes por usuario afectado**. Aunque se mantiene por decisión del titular **hasta nuevo acuerdo**, genera una diferencia importante frente a GestiónAero, que anuncia usuarios y aviones ilimitados por los mismos ARS 60.000 de abono inicial.

**Ejemplos ilustrativos, antes de impuestos, asumiendo que todos los recursos están sujetos al cargo:**

| Caso institucional | AeroSuite provisional | GestiónAero Full publicado |
|---|---:|---:|
| 1 aeronave + 10 usuarios | ARS 107.000/mes | ARS 60.000/mes |
| 3 aeronaves + 20 usuarios | ARS 164.500/mes | ARS 60.000/mes |
| 5 aeronaves + 50 usuarios | ARS 295.000/mes | ARS 60.000/mes |

Los ejemplos **no** presuponen descuento de primera aeronave para planes empresa. El beneficio de 1 aeronave gratis se definió para modalidad **particular** y está pendiente de aclaración para instituciones. GestiónAero aclara IVA no incluido; el tratamiento fiscal del precio provisional de AeroSuite sigue pendiente.

**Prueba:** GestiónAero anuncia 30 días. AeroSuite aprobó **un mes gratis por escuela**, que requiere definir «mes calendario» versus «30 días». No activar cobro automático al acabar la prueba.

**No confundir con Airnizer:** los valores de ARS 60.000 + 10.500 + 3.650 fueron aportados por usuario como referencia del otro proveedor, mientras GestiónAero publica abono fijo con recursos ilimitados.

## 4. Aeros Gestión (otro competidor)

**Fuente:** https://aeros.com.ar/web/ (consulta 25/10/2026).

El sitio anuncia:
- Reservas, registro de vuelo, gestión contable y **factura electrónica**.
- Gestión mecánica, consumibles, vencimientos, servicios y documentación.
- Panel de control por indicadores y cuentas corrientes de socios.
- Servicios de información aeronáutica (biblioteca, NOTAM, METAR, LAD, aeródromos) y agente de IA.
- **Aeros SED**, plataforma de educación a distancia para CIAC.
- **Aeros Base gratis** para socios de FADA con cuota vigente (beneficio de afiliación, no gratuidad general).

**Precios generales:** no confirmados públicamente en la fuente revisada. No inventar cifras ni equiparar Aeros Base gratis con un plan universal.

**Ideas aplicables a AeroSuite:** enlazar academia, herramientas operativas, reservas, contabilidad/facturación, vencimientos y trazabilidad; analizar servicios de educación de CIAC y si cuentan con procesos de reconocimiento normativo. No declarar ningún módulo homologado de AeroSuite sin certificación real.

## 5. Comparación estratégica para AeroSuite

### Fortalezas potenciales propias
- Integración con comunidad real **Gente de Vuelo**: mismo inicio de sesión, perfil extendido y fotografía opcional.
- **Formación**: cuadernillos gráficos propios de teoría (30) y CRM (8), Simu PPA, aplicaciones de rodaje, sustentación y mantenimiento.
- **Flight Operations** para prevuelo, navegación por piernas y meteorología, con datos contrastables.
- **AeroLocator** con cartografía, LAD y otras pistas categorizadas por estatus y advertencias.
- Dividir experiencia en **Alumno, Instructor/Jefatura y Administración** y usar cuentas institucionales verificadas.

### Brechas funcionales/riesgos a resolver
- La demostración aún no equivale a SaaS multi-institución operable, con acceso autónomo y facturación.
- Onboarding, invitaciones y autorizaciones por escuela, políticas RLS y auditoría son previos a la operación con datos reales.
- Reservas con bloqueo por vencimientos, RAV verificada, conciliación de contabilidad y flota, gestión de combustible, WhatsApp y facturación deben probarse extremo a extremo.
- El esquema de precio por usuario puede penalizar escuelas medianas; conviene probar disposición de pago y costo real.
- Respetar la privacidad de los estudiantes y la validez de documentos aeronáuticos; jamás prometer cumplimiento o aptitud solo por tener un registro informático.

### Oportunidades de diferenciación
1. Experiencia educativa y comunitaria integrada, no solo administración.
2. Interfaz aeronáutica sencilla, legible y responsive frente a formularios extensos.
3. Planificación previa al vuelo + biblioteca + progreso académico + evaluación del instructor con **una única ficha y trazabilidad**.
4. Mantenimiento y aeronaves privados para pilotos particulares; considerar 1 aeronave gratis fuera del abono institucional.
5. Facilitador de adopción: importar planillas, guía de configuración y soporte de primer mes.
6. Funciones de IA **con fuente y supervisión humana**, no fuente oficial de decisiones de vuelo.

## 6. Agenda de pruebas de competencia (pendiente)

- Solicitar demostraciones comerciales de GestiónAero y Aeros Gestión con autorización del proveedor; documentar qué módulos son realmente operativos.
- Hacer una prueba completa del ciclo **alta escuela → carga avión y pilotos → reserva → vuelo → cierre → RAV → cargo en cuenta**.
- Verificar reglas de permisos por piloto/instructor/jefe/admin, vencimientos, trazabilidad y recuperación/exportación de datos.
- Consultar si GestiónAero Full mantiene ilimitados a cualquier escala y cuáles son los costos de alta, soporte, migración, límites de almacenamiento, WhatsApp, condiciones de cancelación y factura.
- Confirmar si las RAV exportadas satisfacen los formularios y requisitos ANAC vigentes (validación propia con normativa).
- Auditar ergonomía real en PC y móvil, tiempo de alta y cantidad de clics por tarea.
- Simular precios y margen AeroSuite a 1/3/5/10 aeronaves y 10/20/50/100 usuarios; entrevistar escuelas piloto.
- Evaluar modalidad **tarifa plana sin usuarios extra**, y tarifario por tramo/flota como **propuesta**, no decisión aprobada.
- Mantener sin cambios el **tarifario provisional decidido por el titular** hasta resolución expresa; no crear cobros ni ofrecer publicitariamente importes no validados.

**Relación con otros archivos:** [Caja de Ideas maestra](CAJA-DE-IDEAS.md) · [Anexo comercial aprobado provisionalmente](IDEAS-seguimiento-aeronaves.md).
