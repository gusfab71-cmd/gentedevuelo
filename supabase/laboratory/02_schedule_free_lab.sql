
-- Programación SOLO en proyecto gratuito de laboratorio (no producción).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
 'aerosuite-lab-integridad-lunes-09-art',
 '0 12 * * 1',
 'select aerosuite_lab.run_weekly()'
);
