-- No conceder ejecución directa de funciones internas de marcación de saldos a anónimos.
revoke all on function aerosuite_internal.aerosuite_settled_bookings_week(uuid,date,date) from public,anon;
grant execute on function aerosuite_internal.aerosuite_settled_bookings_week(uuid,date,date) to authenticated;