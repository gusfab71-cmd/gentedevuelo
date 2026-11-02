# AeroSuite — Itinerario maestro de pruebas integrales
**Versión:** 02/11/2026 · **Estado:** APROBADO PARA EJECUCIÓN POR ETAPAS · **Alcance:** consolidación y corrección de funciones existentes; no ampliar módulos.

## Reglas obligatorias
- Probar **un paso por vez** y no avanzar si el anterior falla. Cada fallo se documenta, se corrige de manera integral y se vuelve a probar junto con sus dependencias.
- Ensayar con las **cinco cuentas reales del Centro de Testeo Permanente**: Administrador/Director, Secretaría, Instructor, Alumno y Piloto PPA/PCA. No usar clientes ni datos reales para pruebas.
- **No eliminar ni reiniciar** instituciones, usuarios, historiales, libros, cobros ni movimientos sin acuerdo explícito; conservar evidencia de cada prueba.
- Usar una reserva y un vuelo **identificables por UUID/fecha/matrícula**, con datos de prueba coherentes. Diferenciar flujo simulado, vuelo registrado y hechos aeronáuticos realmente certificados.
- Siempre comprobar desde el rol que **produce** el dato y desde los roles que lo **consumen**. Verificar persistencia tras cerrar y reabrir sesión.
- Por cada paso: registrar fecha, rol, institución, aeronave, operación, resultado **APROBADO / FALLÓ / BLOQUEADO / NO PROBADO**, captura o evidencia, error y corrección. No confundir código de GitHub, Supabase y versión desplegada en Vercel.

## Precondición 00 — Despliegue y línea base
**Acciones:** verificar Vercel exitoso para el último commit y que el sitio refleje las nuevas pantallas; comprobar Auth/Supabase, flota de laboratorio, cuentas de prueba e identificación de institución. Documentar datos actuales y **no modificar los 3 cobros históricos ni horas**.
**Aprobación:** último cambio visible con sesión real; sin errores de inicio ni permisos. **Bloqueante:** límite build-rate-limit de Vercel.

## 01 — Superadministrador, institución, licencia e invitaciones
**Rol:** Superadmin → Director/Secretaría.
**Acciones:** comprobar institución de laboratorio y sus permisos; invitaciones de prueba por rol y activación de cuenta/contraseña, sin duplicar usuarios; licencia y modo lectura.
**Aprobación:** cada persona entra al portal correspondiente, sin acceso a otra institución y sin contaminar Integrantes de Gente de Vuelo.

## 02 — Perfil único, rol, habilitaciones y documentación
**Roles:** Alumno, Instructor, Piloto PPA/PCA; revisión Dirección/Secretaría.
**Acciones:** completar ficha común una sola vez; ver campos propios; salir y volver a entrar; verificar documentación y vencimientos; probar licencia PPA/PCA y autorización para vuelo sin instructor; un instructor/piloto/alumno con múltiples instituciones selecciona correctamente la suya.
**Aprobación:** un cambio de dato común se refleja donde corresponde sin alterar autorizaciones ni otros perfiles. Piloto no ve Academia/Prácticas/Devoluciones; Alumno conserva formación.

## 03 — Alta de aeronave y mantenimiento inicial
**Rol:** Dirección/Secretaría.
**Acciones:** dar de alta matrícula normalizada (ej. LV-ERT) y modelo, estado y documentación; abrir Mantenimiento y verificar creación de ficha vinculada sin duplicados; **cargar horas iniciales y controles únicamente desde registros técnicos auténticos**, o declarar pendiente en laboratorio; revisar motor/hélice/célula separados.
**Aprobación:** una misma matrícula en flota, turnera, operaciones y mantenimiento; horas iniciales desconocidas nunca se inventan.

## 04 — Controles, intervalos y alertas previas
**Rol:** Dirección/Secretaría.
**Acciones:** configurar un control de aceite de ejemplo de 50 h **solo si es aplicable al motor y programa real**, último cumplimiento documentado y aviso previo de 10 h; variar aviso a 5 y 15 h; comprobar mensaje en Mantenimiento y cuando Secretaría selecciona aeronave para preparar y publicar turnos; comprobar ausencia de falso cálculo si faltan horas o constancia.
**Aprobación:** cada control usa **su propio umbral configurable**, se presenta por matrícula y describe horas restantes; no certifica aeronavegabilidad.

## 05 — Disponibilidad y bloqueo por fuera de servicio
**Rol:** Dirección/Secretaría; observación Instructor, Alumno, Piloto.
**Acciones:** retirar temporalmente de servicio una aeronave de laboratorio con motivo; comprobar que no ofrezca cupos nuevos; verificar historial, notificaciones y que volver a disponible requiera decisión humana/documental; revisar conflictos y aeronave archivada.
**Aprobación:** coherencia de Flota, Turnera y Mantenimiento sin borrar reservas ni registros históricos.

## 06 — Publicar turnera y comprobar horarios
**Roles:** Dirección/Secretaría, Instructor, Alumno y Piloto.
**Acciones:** turnos de 90 minutos, horarios ART, semana siguiente, aeronaves disponibles y ocupación; publicación individual/semanal y avisos técnicos; comprobar que no se dupliquen turnos, se respeten cupos, aeronaves e instructor.
**Aprobación:** todos ven la misma agenda según permiso; cupos correctamente ocupados/reservados y alertas visibles.

## 07 — Reserva Alumno con instructor
**Roles:** Alumno → Instructor/Secretaría/Dirección.
**Acciones:** reservar; verificar Pendiente; tomar/asignar instructor; confirmar; reprogramar con consentimiento y motivo; comprobar detalle de alumno e instructor y auditoría; probar cancelación válida.
**Aprobación:** estado consistente para todos, sin pérdidas ni dobles reservas; cambios históricos rastreables.

## 08 — Reserva Piloto PPA/PCA: sin y con instructor
**Roles:** Piloto → Secretaría/Dirección.
**Acciones:** verificar licencia/autorización real antes de permitir «Sin instructor»; probar rechazo sin habilitación; reservar con autorización; probar «Con instructor» y asignación; revisar tasas aplicables más adelante.
**Aprobación:** Alumno nunca puede reservar solo como Piloto; cada modalidad queda grabada en la reserva y llega a Caja.

## 09 — Vuelo realizado y registro de minutos
**Roles:** Instructor/Piloto → Secretaría.
**Acciones:** registrar vuelo efectivo, matrícula realmente utilizada, horarios UTC Libro, HH:MM exacto, función, aterrizajes; diferenciar vuelo con informe de instrucción de vuelo particular. Asegurar que una reserva no realizada nunca cuente como actividad.
**Aprobación:** un identificador de vuelo une fecha, persona, instructor si aplica, aeronave y minutos fuente; distinción clara entre estado del vuelo y estado de cobro.

## 10 — Cobro inmediato y descuentos de pack
**Roles:** Secretaría → Dirección; Alumno/Piloto consultan sus horas.
**Acciones:** pago efectivo/transferencia acreditada según funciones existentes, descuento pack y saldos, idempotencia, no doble cobro, comprobante; verificar tarifa de **aeronave + modalidad (con/sin instructor)**, sin usar por defecto la tarifa general para vuelo solo; verificar precio por minutos reales, evitando redondeos acumulativos.
**Aprobación:** exactamente un cierre monetario o un consumo de pack por vuelo, saldo correcto y asiento en Contaduría; ningún cambio indebido de aeronave o modalidad.

## 11 — Informe del Instructor, correcciones y conciliación
**Roles:** Instructor → Secretaría/Dirección → Alumno.
**Acciones:** instructor carga informe después del pago, libro y observaciones; devolución o corrección auditada; aprobación; cotejo de minutos pagados vs informe y Libro; bloqueo de cancelación de vuelo ya cumplido; alumno ve únicamente informes aprobados.
**Aprobación:** cobro no se duplica al aprobar; diferencias se muestran y resuelven con trazabilidad, sin cambiar liquidaciones históricas automáticamente.

## 12 — Contaduría y cierre administrativo
**Roles:** Secretaría/Dirección.
**Acciones:** conciliar cobros, ventas/consumos de pack, caja chica, gastos ordinarios, extraordinarios y de mantenimiento, reportes diarios/mensuales; verificar que el Director pueda pedir cierre diario retroactivo sin perder acumulados.
**Aprobación:** no se duplica ningún movimiento; contabilidad refleja operaciones y aeronaves; los gastos de mantenimiento conservan su relación documental y no se atribuyen arbitrariamente.

## 13 — Conciliación de utilización de aeronave y mantenimiento
**Roles:** Secretaría/Dirección.
**Acciones:** consultar vuelos pagados por matrícula, detectar liquidaciones sin matrícula (actualmente hay una histórica), verificar horas declaradas y revisadas; cotejar **Hobbs/tacómetro/TTAF/TTSN/TSO/ciclos según el documento aplicable** antes de actualizar contadores; registrar intervenciones de mantenimiento con referencias; reconsultar avisos de turnera.
**Aprobación:** no se confunden minutos de caja con horas técnicas; aviso de próximo mantenimiento se actualiza al cambiar un contador documentado; no se altera ningún historial sin prueba.

## 14 — Libro de Vuelo y RAV
**Roles:** Instructor/Piloto → Dirección/Secretaría.
**Acciones:** comprobar que los registros de vuelos autorizados y tiempos correctos se reutilizan; generar antecedentes de RAV sin duplicar datos; distinguir borrador/pendiente/certificado. Probar permisos de firma y controles regulatorios antes de habilitar un RAV formal.
**Aprobación:** actividad del piloto consistente con operaciones y sin certificación automática ficticia.

## 15 — Seguridad, regresión y prueba cruzada final
**Roles:** cinco cuentas + Superadmin.
**Acciones:** repetir circuito completo con vuelos separados (Alumno instrucción; PPA/PCA solo; PPA/PCA con instructor), verificar RLS, selección de institución, lectura sola, permisos por rol, integridad al recargar, reportes y exportaciones. Comprobar bloqueos: aeronave fuera de servicio, falta de habilitación, saldo pack insuficiente, cobro duplicado, dato técnico sin respaldo.
**Aprobación global:** **cero bloqueantes** y ningún paso con datos desacoplados. Conservar evidencia y aprobar un acta final; no declarar producción lista antes de desplegar y probar.

## Bitácora de ejecución
| Paso | Fecha | Resultado | Evidencia | Hallazgo | Reprueba |
|---|---|---|---|---|---|
| 00 | — | BLOQUEADO / verificar Vercel | — | Build-rate-limit reciente | — |
| 01–15 | — | NO PROBADO EN ESTE ITINERARIO | — | Se ejecutarán en secuencia | — |

## Hallazgos de partida (02/11/2026; no corregir automáticamente)
- 14 reservas, 3 liquidaciones, 240 minutos declarados; 3 liquidaciones sin conciliación final, 3 reservas cobradas sin estado «completed» y 1 liquidación sin matrícula correspondiente.
- 3 aeronaves registradas (2 disponibles, 1 fuera de servicio); 0 fichas técnicas almacenadas, por lo que las alertas calculadas deben permanecer como advertencia de documentación faltante.
- 0 tarifas configuradas para aeronave+modalidad, 0 autorizaciones de piloto verificadas y 0 reservas «sin instructor» ensayadas.
- Los RPC y pantallas de conciliación por matrícula y alertas configurables existen en código/backend; la pantalla de cobro aún no consulta la tarifa de aeronave+modalidad. Vercel bloqueó despliegues recientes.
