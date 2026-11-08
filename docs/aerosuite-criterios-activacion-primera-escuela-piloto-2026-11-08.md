# AeroSuite · Criterios de salida del Laboratorio hacia la primera escuela piloto

**Estado:** plan de activación, no orden de alta. No hay escuelas reales dadas de alta y **no autoriza crear ninguna** antes de aprobación explícita del responsable.

## 1. Condiciones técnicas de aceptación

- [x] El acceso a datos está aislado por institución con RLS, membresía por rol y RPC de servidor; comprobar permisos reales en navegador antes de aceptar.
- [x] La turnera tiene guardas de duplicación por alumno, aeronave e instructor; se permiten **dos aeronaves simultáneas**, cada una con su propio cupo.
- [x] Las reservas y horas se han ensayado de modo reversible con Secretaría, Alumno, Instructor y Dirección.
- [x] La contaduría y packs registran cobro, consumo, anulación, idempotencia y saldo; falta cierre administrativo con respaldos de escuela real.
- [x] El mantenimiento identifica vencimientos documentados e impide publicarlos; no se crea ningún contador técnico sumando las horas cobradas.
- [x] PPA/PCA: control de CMA para la fecha de reserva y confirmación, revocación si cambia documento, y revisión documental de predespacho de 15 minutos; **no sustituye despacho real**.
- [x] RAV: borradores persistentes, trazabilidad, revisión interna, no certificación ni firma.
- [ ] Las mismas versiones de frontend y backend deben estar desplegadas con Preview funcional, con resultado visual revisado por cada rol.
- [ ] Completar test concurrente real de 2 clientes simultáneos en el mismo cupo, aeronaves distintas y reprogramación.
- [ ] Cumplir los requisitos de certificación RAV formal y respaldo documental de horas si la escuela necesita ese servicio.
- [ ] Definir y probar un procedimiento de retorno a servicio con documentación técnica de la aeronave (véase sección 4).
- [ ] Verificar respaldos y recuperación, permisos de Storage, vencimientos de licencia institucional y lectura sola.
- [ ] Registrar los resultados del CTP y obtener autorización del responsable para el cambio de etapa.

## 2. Secuencia de ensayo de la jornada

1. Secretaría publica la semana de tres categorías (aeronave, simulador, teoría).
2. Dos alumnos pueden reservar **aeronaves diferentes a la misma hora**; el mismo alumno no puede superponerse.
3. Se preasigna instructor; confirmado, reprogramado y cancelado quedan auditados.
4. Se presenta informe de vuelo con horas/minutos UTC y aterrizajes; Secretaría cobra o descuenta pack.
5. Se revisan Libro de Vuelo, informe, caja, saldos, honorarios y observaciones de instructores.
6. Conciliar manualmente el total por aeronave con registros reales; **no actualizar Hobbs/célula/motor/hélice por cálculo automático**.
7. Simular un vencimiento de mantenimiento y salida de servicio, intentar publicar (debe bloquearse), documentar la subsanación y probar nueva disponibilidad.
8. Para piloto PPA/PCA, revocar/expirar CMA después de confirmar: el predespacho debe pasar a **NO DESPACHAR**, sin eliminar historial de reserva.
9. Cada rol comprueba que no ve cuentas ni información ajena a la institución.

## 3. Condiciones de primera escuela real

- Solicitar al responsable el nombre y la autorización **cuando el software esté preparado**. No utilizar información personal ni matriculación real de la escuela en tests.
- Alta nueva con identificador institucional propio, roles y permisos específicos; nunca copiar filas del Laboratorio.
- Partir de **0 reservas, 0 informes, 0 packs, 0 movimientos y 0 horas** como registros AeroSuite. Los saldos o vuelos históricos se importarán solo con respaldo y aprobación, sin confundirlos con registros originados en AeroSuite.
- Configurar matrículas, tarifas PPA/PCA, instructores y política de horarios; cotejar con responsable las inspecciones y documentación aplicables.
- Planificar sesión de validación asistida, copia de seguridad y procedimiento de marcha atrás sin afectar el Laboratorio.
- Mantener la comunidad Gente de Vuelo gratuita y separada de la licencia comercial de AeroSuite.

## 4. Limitaciones operativas actuales

- La **gestión administrativa de disponibilidad** de una aeronave no equivale por sí sola a liberación de mantenimiento ni conformidad de aeronavegabilidad.
- Una revisión documental de predespacho es una verificación temporal de datos; no inicia el vuelo ni garantiza condiciones meteorológicas, NOTAM, habilitaciones específicas o documentación física.
- El control de concurrencia de filas está respaldado por locks de institución y trigger; sin pruebas reales con dos sesiones, no afirmar que las condiciones de carrera estén exhaustivamente validadas.
- La contabilización de horas del Libro y sus comprobantes debe mantenerse separada de contadores técnicos de aeronave.
- **No liberar la escuela piloto** mientras Vercel muestre `build-rate-limit` y no haya Preview operativo.

## 5. Pendientes históricos que NO deben corregirse inventando datos

- Un checkout del Laboratorio sin matrícula conciliada: requerirá respaldo documental, no suponer aeronave.
- Un vuelo aprobado de prueba pendiente de liquidar: verificar si es prueba abierta, cobro posterior o dato a cancelar auditadamente.
- RAV formal pendiente de validación de requisitos externos y firma auténtica; mantener solo revisión interna.

**Anexo técnico:** migraciones `20261108055418_aerosuite_pilot_preflight_documentary_gate_20261108.sql` y `20261108055841_aerosuite_parallel_aircraft_booking_overlap_guard_20261108.sql` en esta rama.
