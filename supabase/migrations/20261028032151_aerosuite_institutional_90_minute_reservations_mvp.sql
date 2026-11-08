
-- AeroSuite: turnera institucional aislada, turnos de 90 minutos, aprobaciones y cancelaciones auditadas.
create table if not exists public.aerosuite_flight_bookings (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 student_id uuid not null,
 instructor_id uuid,
 starts_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','confirmed','completed','cancelled')),
 aircraft text not null default '',
 cancellation_reason text not null default '',
 created_by uuid not null,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists aerosuite_flight_booking_slot_unique on public.aerosuite_flight_bookings(institution_id, starts_at) where status <> 'cancelled';
create index if not exists aerosuite_flight_booking_inst_date on public.aerosuite_flight_bookings(institution_id,starts_at desc);
create table if not exists public.aerosuite_flight_booking_audit (
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 booking_id uuid not null references public.aerosuite_flight_bookings(id) on delete cascade,
 actor_id uuid not null,
 event text not null,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index if not exists aerosuite_booking_audit_inst on public.aerosuite_flight_booking_audit(institution_id,created_at desc);
alter table public.aerosuite_flight_bookings enable row level security;
alter table public.aerosuite_flight_booking_audit enable row level security;
revoke all on public.aerosuite_flight_bookings,public.aerosuite_flight_booking_audit from anon,authenticated;
create or replace function public.aerosuite_booking_schedule(p_institution_id uuid,p_date_from date,p_date_to date)
returns table(booking_id uuid,starts_at timestamptz,status text,my_booking boolean,student_id uuid,student_email text,instructor_id uuid,instructor_email text,aircraft text)
language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid := auth.uid();v_role text;v_mode text;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','instructor','alumno','secretaria')
 limit 1;
 if v_role is null or v_mode='blocked' then raise exception 'No tenés acceso a esta institución.' using errcode='42501';end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_date_to>p_date_from+14
 then raise exception 'Período de consulta inválido.' using errcode='22023';end if;
 return query select b.id,b.starts_at,b.status,b.student_id=v_actor,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.student_id else null::uuid end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then su.email::text else null::text end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.instructor_id else null::uuid end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then iu.email::text else null::text end,
  case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.aircraft else '' end
 from public.aerosuite_flight_bookings b
 left join auth.users su on su.id=b.student_id
 left join auth.users iu on iu.id=b.instructor_id
 where b.institution_id=p_institution_id
 and b.starts_at >= (p_date_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and b.starts_at < ((p_date_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
 order by b.starts_at;
end;$fn$;
create or replace function public.aerosuite_booking_action(
 p_institution_id uuid,p_action text,p_booking_id uuid default null,
 p_starts_at timestamptz default null,p_student_id uuid default null,
 p_instructor_id uuid default null,p_aircraft text default null,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_booking public.aerosuite_flight_bookings%rowtype;v_id uuid;v_student uuid;v_instructor uuid;v_before jsonb;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in ('administrador','secretaria','instructor','alumno') limit 1;
 if v_actor is null or v_role is null then raise exception 'No autorizado para esta institución.' using errcode='42501';end if;
 if v_mode not in ('trial','grace','active') then raise exception 'La institución está en modo consulta.' using errcode='42501';end if;
 if p_action not in ('request','confirm','cancel','finish') then raise exception 'Acción inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='request' then
   if p_starts_at is null or p_starts_at < now()-interval '30 minutes' or p_starts_at>now()+interval '90 days'
   then raise exception 'Elegí un turno futuro dentro de los próximos 90 días.' using errcode='22023';end if;
   v_student:=case when v_role in ('administrador','secretaria') then coalesce(p_student_id,v_actor) else v_actor end;
   if not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_student and m.role='alumno')
   then raise exception 'El alumno no está registrado en esta institución.' using errcode='42501';end if;
   if exists(select 1 from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id and b.status<>'cancelled' and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') && tstzrange(p_starts_at,p_starts_at+interval '90 minutes','[)'))
   then raise exception 'El horario ya tiene una reserva. Elegí otro turno.' using errcode='23505';end if;
   insert into public.aerosuite_flight_bookings(institution_id,student_id,starts_at,created_by,updated_by)
   values(p_institution_id,v_student,p_starts_at,v_actor,v_actor) returning id into v_id;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data) values(p_institution_id,v_id,v_actor,'requested',jsonb_build_object('student_id',v_student,'starts_at',p_starts_at));
 else
   select * into v_booking from public.aerosuite_flight_bookings where id=p_booking_id and institution_id=p_institution_id for update;
   if not found then raise exception 'No existe esa reserva en tu institución.' using errcode='P0002';end if;
   v_before:=to_jsonb(v_booking); v_id:=v_booking.id;
   if p_action='confirm' then
     if v_booking.status<>'pending' or v_role not in ('administrador','secretaria','instructor') then raise exception 'No podés confirmar esta reserva.' using errcode='42501';end if;
     v_instructor:=case when v_role='instructor' then v_actor else p_instructor_id end;
     if v_instructor is null or not exists(select 1 from public.aerosuite_institution_members m where m.institution_id=p_institution_id and m.user_id=v_instructor and m.role='instructor')
     then raise exception 'Seleccioná un instructor habilitado en esta escuela.' using errcode='22023';end if;
     if exists(select 1 from public.aerosuite_flight_bookings b where b.institution_id=p_institution_id and b.id<>v_booking.id
       and b.instructor_id=v_instructor and b.status in ('confirmed','completed')
       and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') && tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
     then raise exception 'Ese instructor tiene otro vuelo en el mismo horario.' using errcode='23505';end if;
     update public.aerosuite_flight_bookings set status='confirmed',instructor_id=v_instructor,
       aircraft=case when v_role in ('administrador','secretaria') then left(btrim(coalesce(p_aircraft,'')),60) else aircraft end,
       updated_by=v_actor,updated_at=now() where id=v_id;
   elsif p_action='cancel' then
     if v_booking.status not in ('pending','confirmed') or not (v_role in ('administrador','secretaria') or (v_role='alumno' and v_booking.student_id=v_actor and v_booking.status='pending'))
     then raise exception 'No podés cancelar esta reserva.' using errcode='42501';end if;
     if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Indicá el motivo de cancelación.' using errcode='22023';end if;
     update public.aerosuite_flight_bookings set status='cancelled',cancellation_reason=left(btrim(p_reason),250),updated_by=v_actor,updated_at=now() where id=v_id;
   else
     if v_role not in ('administrador','secretaria') or v_booking.status<>'confirmed' then raise exception 'Solo Administración puede cerrar vuelos confirmados.' using errcode='42501';end if;
     update public.aerosuite_flight_bookings set status='completed',updated_by=v_actor,updated_at=now() where id=v_id;
   end if;
   insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
    select p_institution_id,v_id,v_actor,p_action,v_before,to_jsonb(b) from public.aerosuite_flight_bookings b where b.id=v_id;
 end if;
 return jsonb_build_object('ok',true,'booking_id',v_id,'action',p_action);
end;$fn$;
revoke all on function public.aerosuite_booking_schedule(uuid,date,date) from public,anon;
revoke all on function public.aerosuite_booking_action(uuid,text,uuid,timestamptz,uuid,uuid,text,text) from public,anon;
grant execute on function public.aerosuite_booking_schedule(uuid,date,date) to authenticated;
grant execute on function public.aerosuite_booking_action(uuid,text,uuid,timestamptz,uuid,uuid,text,text) to authenticated;
