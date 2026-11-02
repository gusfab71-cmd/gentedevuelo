# AeroSuite — Auditoría de integración operativa
**Fecha:** 1 de noviembre de 2026 (Argentina)  
**Alcance:** repositorio GitHub, funciones y estructura de Supabase, consultas no destructivas del Centro de Testeo Permanente. No sustituye ensayos completos con interfaz autenticada ni certificación de aeronavegabilidad.

## Resultado ejecutivo
La plataforma tiene integraciones funcionales, pero **todavía no es un circuito integral completamente sincronizado**. Prioridades bloqueantes: (1) distinguir al Piloto PPA verificado del Alumno en la institución, (2) impedir reservas sin instructor a personas sin autorización verificada, (3) mantener Flota y Mantenimiento sincronizados y reconciliar horas de componentes, (4) diferenciar tarifas por modalidad y aeronave, (5) asegurar cierre y conciliación de registros históricos.

## Evidencia verificada en el Centro de Testeo
- Integrantes: un administrador, una Secretaría, un instructor y un alumno. La tabla `aerosuite_institution_members` no admite `piloto_ppa` entre sus roles; `aerosuite_institution_invitations` tampoco.
- La tabla `aerosuite_role_declarations` contempla `student`, `instructor` y `pilot` con licencia declarada, **pero las declaraciones están limitadas al estado `unverified`**, sin vínculo de habilitación institucional para reservar como PPA. No se encontró ninguna declaración `pilot` al momento de la auditoría.
- Flota: **2 aeronaves registradas** (LV-RTY y LV-S234) y **1 simulador**, actualmente marcados disponibles. `aerosuite_aircraft_registry` es la fuente de matrícula/disponibilidad utilizada por la turnera.
- Mantenimiento: **sin fichas técnicas sincronizadas en la institución de prueba**, aunque `aerosuite_maintenance_sync_fleet` puede crearlas al entrar a Mantenimiento con permiso de escritura. `aerosuite_maintenance_alerts` devuelve **4 avisos**: faltan horas iniciales y controles configurados en ambas aeronaves. El sistema no puede calcular límites de 50/100 horas sin sus fuentes, tiempos y últimas intervenciones.
- Turnera: publicación semanal, aeronave, simulador y clase; bloques de **90 minutos**, franja **08:30–17:30**, solicitudes, reprogramación, autorización, estados y ocupación. En el momento de la consulta había **166 cupos futuros activos** en el Centro de Testeo. El sistema evita asignar recurso fuera de servicio, pero muestra avisos de mantenimiento no configurado y admite su publicación tras reconocimiento manual; un aviso **no equivale a aeronavegabilidad**.
- **Riesgo principal:** `aerosuite_reserve_with_instructor` acepta la opción sin instructor desde una cuenta del rol `alumno`; `aerosuite_confirm_without_instructor` controla permisos de Secretaría/Dirección y exige referencia textual, pero **no verifica un perfil PPA institucional validado ni su documentación**. Bloquear esa modalidad para alumnos hasta completar la verificación estructurada.
- Informes: existe registro de vuelo vinculado a reserva, revisión, devolución, versiones y acceso del alumno a aprobados. Se observó **1 informe real** en la institución de prueba.
- Caja: **3 liquidaciones** (2 en efectivo y 1 por pack), vinculadas a reservas, con minutos de Libro de Vuelo y trazabilidad. Las tres aún no tenían un informe asociado al momento de la consulta; esto no necesariamente constituye error, porque el informe puede emitirse después, pero requieren conciliación. **Una liquidación histórica no tiene matrícula asociada**, por lo que debe revisarse sin inventar datos ni sobrescribir el historial.
- Precios: `aerosuite_hourly_tariffs` contiene **una sola tarifa por institución**; el cajero calcula importe usando dicha tarifa y los minutos registrados, con importes editables. **No existe tarifa automática diferenciada por piloto PPA/instrucción y aeronave**. El backend de liquidación tampoco decide el precio según `with_instructor`.
- Mantenimiento/horas: no se halló trigger de `aerosuite_flight_reports` ni `aerosuite_flight_checkouts` que actualice `aerosuite_institution_maintenance`; no se constató otra función que conecte esas tablas. La ficha de mantenimiento utiliza sus propios contadores y controles configurados. **No sumar automáticamente horas de cobro a motor/hélice sin definir fuente de cómputo y criterios técnicos; pueden diferir vuelo, Hobbs, tacómetro y ciclos.**
- Seguridad de datos: las tablas `aerosuite_%` del esquema público verificadas aparecen con RLS habilitado (no se encontraron tablas de ese prefijo con RLS desactivado). Esto no sustituye una prueba completa de aislamiento por institución.

## Matriz de integración
| Proceso | Enlace actual | Brecha | Prioridad |
|---|---|---|---|
| Registro → condición aeronáutica | Existe declaración `student/pilot` | No hay **Piloto PPA institucional verificado** ni permiso/rol específico; licencias no validadas contra reserva | **P0** |
| Flota → Mantenimiento | Existe sincronización RPC | Sincroniza al entrar al módulo; fichas del Centro de Testeo aún sin crear/parametrizar | **P0** |
| Flota/Mantenimiento → Turnera | Matrícula y disponibilidad enlazadas, avisos visibles | El aviso de mantenimiento incompleto puede aceptarse y continuar; requiere reglas claras de habilitación operacional y responsable | **P0** |
| Persona → Reserva | Alumno y turnos semanales enlazados | Una cuenta Alumno puede solicitar vuelo sin instructor; no se comprueba PPA verificado | **P0** |
| Reserva → Vuelo/Informe | ID de reserva y revisiones de informe | Completar flujo específico de piloto sin instructor y conciliación del tiempo real | **P1** |
| Vuelo/Libro → Mantenimiento | Datos de vuelo separados de ficha técnica | Falta conciliación de lecturas/ciclos por célula, motor y hélice; manual técnico y personal responsable configuran intervalos | **P1** |
| Vuelo → Caja/Pack → Contaduría | Liquidación por minutos, efectivo/pack, movimientos y estados | Una tarifa institucional; falta tarifa específica por aeronave y modalidad, versión de precio y validación de descuentos | **P1** |
| Históricos/Informes → Auditoría | Auditorías de reservas, versiones y caja | Reconciliar matrícula faltante y diferencias de horas cuando exista informe posterior | **P1** |

## Orden de trabajo recomendado (sin cambios destructivos)
1. **Identidad única:** conservar `user_id` y `institution_id`, agregar condición `Alumno` / `Piloto PPA` institucional verificada, con matrícula de licencia, habilitaciones, aptitud, vencimientos y control del responsable. No confundir la autodeclaración de perfil con habilitación operativa.
2. **Permisos y reservas:** la opción *sin instructor* solo para pilotos verificados y autorizados por esa escuela; la de *con instructor* para instrucción según la escuela. Mantener el mismo calendario y bloqueo de recursos.
3. **Flota, mantenimiento y estado operativo:** sincronización de altas/bajas sin depender de abrir la pantalla; en mantenimiento configurar manualmente programa, intervalos y fuentes por célula, motor y hélice. La aplicación calcula alertas, **no decide por sí sola la aeronavegabilidad**.
4. **Horas reales:** registrar tiempo de vuelo y, cuando aplique, lecturas de instrumento/ciclos independientes; actualizar el mantenimiento mediante conciliación autorizada, evitar doble cómputo y mantener historial.
5. **Tarifario:** precios versionados y configurados por escuela **por aeronave y modalidad** (instrucción y Piloto PPA), sin importes prefijados. El cajero debe ver precio aplicable y monto calculado con minutos reales; packs sujetos a su propia regla de elegibilidad.
6. **Cerrar el circuito:** reserva → confirmación → vuelo → Libro → caja/pack → informe → validación → actualización de indicadores y mantenimiento → consultas del interesado y del Director.
7. **Pruebas E2E:** usar Centro de Testeo Permanente con cuatro cuentas técnicas y un piloto PPA de prueba adicional; ejecutar escenarios con rollback/no persistencia para límites, errores, vencimientos y cobros. Comprobar a nivel visual con sesión real antes de considerar un módulo terminado.

**Estado de esta auditoría:** revisión de lectura; **no se cambiaron roles, tarifas, matrículas, horas, reservas ni cobros**. Las correcciones de arquitectura deben implementarse y probarse por etapas con respaldo de datos.
