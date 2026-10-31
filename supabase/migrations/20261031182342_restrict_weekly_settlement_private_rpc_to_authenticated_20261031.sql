-- Limitar la función interna de estado saldado a sesiones autenticadas. La función verifica institución y rol.
revoke all on function aerosuite_internal.aerosuite_settled_bookings_week(uuid,date,date) from public,anon;
grant execute on function aerosuite_internal.aerosuite_settled_bookings_week(uuid,date,date) to authenticated;
