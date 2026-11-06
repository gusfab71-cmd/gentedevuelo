-- Laboratorio gratuito solamente: ejecutar la simulación 10 minutos antes del informe de GitHub (lunes 09:00 ART).
select cron.unschedule('aerosuite-lab-integridad-lunes-09-art');
select cron.schedule('aerosuite-lab-integridad-lunes-0850-art',
 '50 11 * * 1',
 'select aerosuite_lab.run_weekly()');
