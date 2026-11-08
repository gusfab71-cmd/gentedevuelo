-- Transición no destructiva: los horarios futuros de la franja anterior
-- dejan de ofrecerse cuando no tienen ninguna reserva ni vuelo legado vinculado.
-- Todo slot con reservas, aunque estén canceladas, se conserva para trazabilidad.
update public.aerosuite_availability_slots s
set retired_at=now(),updated_at=now()
where s.retired_at is null and s.starts_at>now()
 and (s.starts_at at time zone 'America/Argentina/Buenos_Aires')::time
     not in(time '08:30',time '10:00',time '11:30',time '13:00',time '14:30',time '16:00')
 and not exists(select 1 from public.aerosuite_activity_reservations r where r.slot_id=s.id)
 and not exists(select 1 from public.aerosuite_flight_bookings b
   where b.institution_id=s.institution_id and b.starts_at=s.starts_at
    and b.status in('pending','confirmed','completed')
    and upper(coalesce(b.aircraft,''))=upper(s.resource_label));
