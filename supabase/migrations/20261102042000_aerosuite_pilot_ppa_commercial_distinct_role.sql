-- Migración de rol institucional Piloto PPA/Comercial; no reutilizar el rol Alumno.
-- Los parámetros student_id antiguos identifican la misma cuenta Auth por compatibilidad de datos.
alter table public.aerosuite_institution_members
 drop constraint if exists aerosuite_institution_members_role_check;
alter table public.aerosuite_institution_members
 add constraint aerosuite_institution_members_role_check
 check(role in ('administrador','secretaria','instructor','alumno','piloto','operaciones','tesoreria'));
alter table public.aerosuite_institution_invitations
 drop constraint if exists aerosuite_institution_invitations_role_check;
alter table public.aerosuite_institution_invitations
 add constraint aerosuite_institution_invitations_role_check
 check(role in ('administrador','secretaria','instructor','alumno','piloto','operaciones','tesoreria'));


CREATE OR REPLACE FUNCTION public.aerosuite_accept_invitation_role(p_institution_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := auth.uid();
 v_mail text;
 v_invitation public.aerosuite_institution_invitations%rowtype;
begin
 if v_user is null or p_institution_id is null or p_role not in ('administrador','secretaria','instructor','alumno','piloto') then
  raise exception 'Invitación incompleta o inválida.' using errcode='42501';
 end if;
 select lower(btrim(u.email)) into v_mail from auth.users u
 where u.id=v_user and u.email_confirmed_at is not null;
 if v_mail is null then
  raise exception 'Debés verificar tu correo antes de activar AeroSuite.' using errcode='42501';
 end if;
 select inv.* into v_invitation
 from public.aerosuite_institution_invitations inv
 join public.aerosuite_institutions org on org.id=inv.institution_id
 where inv.institution_id=p_institution_id and inv.role=p_role
   and lower(btrim(inv.email))=v_mail
   and inv.accepted_at is null and inv.revoked_at is null and inv.expires_at>now()
   and private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
       in ('trial','grace','active')
 order by inv.created_at desc limit 1 for update of inv;
 if v_invitation.id is null then
  raise exception 'No hay una invitación vigente para este correo, institución y rol. Comprobá que usaste el correo y enlace recibidos.' using errcode='42501';
 end if;
 insert into public.aerosuite_institution_members(institution_id,user_id,role,assigned_by)
 values(v_invitation.institution_id,v_user,v_invitation.role,v_invitation.created_by)
 on conflict (institution_id,user_id,role) do nothing;
 update public.aerosuite_institution_invitations
 set accepted_at=now(),accepted_by=v_user where id=v_invitation.id;
 return jsonb_build_object('ok',true,'institution_id',v_invitation.institution_id,'role',v_invitation.role);
end;
$function$;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_reserve(p_institution_id uuid, p_slot_id uuid, p_student_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_role text;v_mode text;v_slot public.aerosuite_availability_slots%rowtype;
 v_student uuid;v_res_id uuid;v_booking_id uuid;v_count integer;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria','alumno','piloto') limit 1;
 if v_actor is null or v_role is null or v_mode not in('trial','active','grace') then
  raise exception 'Sin autorización para reservar en esta escuela.' using errcode='42501';
 end if;
 v_student:=case when v_role in('alumno','piloto') then v_actor else p_student_id end;
 if v_student is null or not exists(select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_student and m.role in('alumno','piloto')) then
  raise exception 'Elegí un alumno registrado en la institución.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_slot from public.aerosuite_availability_slots
 where id=p_slot_id and institution_id=p_institution_id and retired_at is null for update;
 if not found or v_slot.published_at is null or v_slot.starts_at<=now()
   or (v_slot.starts_at at time zone 'America/Argentina/Buenos_Aires')::time not in (time '08:30',time '10:00',time '11:30',time '13:00',time '14:30',time '16:00')
   or v_slot.starts_at>now()+interval '90 days' then
  raise exception 'Este horario no está publicado o ya venció.' using errcode='22023';
 end if;
 if v_slot.activity='flight' and not exists(select 1 from public.aerosuite_aircraft_registry a
  where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
   and a.availability='available' and a.archived_at is null) then
  raise exception 'La aeronave ya no está disponible. Consultá con Secretaría.' using errcode='22023';
 end if;
 if v_slot.activity='simulator' and not exists(select 1 from public.aerosuite_simulators s
  where s.institution_id=p_institution_id and lower(s.name)=lower(v_slot.resource_label)
    and s.availability='available' and s.archived_at is null) then
  raise exception 'El simulador ya no está disponible. Consultá con Secretaría.' using errcode='22023';
 end if;
 if exists(select 1 from public.aerosuite_activity_reservations r
   where r.institution_id=p_institution_id and r.student_id=v_student and r.status<>'cancelled'
     and r.slot_id=v_slot.id) then
  raise exception 'El alumno ya está anotado en este turno.' using errcode='23505';
 end if;
 if exists(select 1 from public.aerosuite_activity_reservations r
    join public.aerosuite_availability_slots s on s.id=r.slot_id
    where r.institution_id=p_institution_id and r.student_id=v_student and r.status in('pending','confirmed')
    and tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+v_slot.duration_minutes*interval '1 minute','[)')
 ) or exists(select 1 from public.aerosuite_flight_bookings b
    where b.institution_id=p_institution_id and b.student_id=v_student
    and b.status in('pending','confirmed')
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+v_slot.duration_minutes*interval '1 minute','[)')
 ) then
  raise exception 'El alumno ya tiene otra actividad en ese horario.' using errcode='23505';
 end if;
 select count(*) into v_count from public.aerosuite_activity_reservations r
  where r.slot_id=v_slot.id and r.status in('pending','confirmed','completed');
 if v_count>=v_slot.capacity then
  raise exception 'No quedan cupos para este horario.' using errcode='23505';
 end if;
 if v_slot.activity='flight' then
  if exists(select 1 from public.aerosuite_flight_bookings b
   where b.institution_id=p_institution_id and b.status in('pending','confirmed')
    and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
    and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
        tstzrange(v_slot.starts_at,v_slot.starts_at+interval '90 minutes','[)')
  ) then raise exception 'Esta aeronave está asignada a otro vuelo.' using errcode='23505';end if;
  insert into public.aerosuite_flight_bookings
   (institution_id,student_id,starts_at,status,created_by,updated_by)
  values(p_institution_id,v_student,v_slot.starts_at,'pending',v_actor,v_actor)
  returning id into v_booking_id;
  insert into public.aerosuite_flight_booking_audit
   (institution_id,booking_id,actor_id,event,after_data)
  values(p_institution_id,v_booking_id,v_actor,'requested',jsonb_build_object(
    'student_id',v_student,'starts_at',v_slot.starts_at,'availability_slot_id',v_slot.id));
 end if;
 insert into public.aerosuite_activity_reservations
  (institution_id,slot_id,student_id,booking_id,created_by)
 values(p_institution_id,v_slot.id,v_student,v_booking_id,v_actor) returning id into v_res_id;
 insert into public.aerosuite_activity_audit
  (institution_id,slot_id,reservation_id,actor_id,event,detail)
 values(p_institution_id,v_slot.id,v_res_id,v_actor,'reserved',jsonb_build_object(
  'student_id',v_student,'activity',v_slot.activity,'booking_id',v_booking_id));
 return jsonb_build_object('ok',true,'reservation_id',v_res_id,'booking_id',v_booking_id);
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_availability_week(p_institution_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();v_role text;v_mode text;v_slots jsonb;v_reservations jsonb;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor
 and m.role in('administrador','secretaria','alumno','piloto','instructor') limit 1;
 if v_actor is null or v_role is null or v_mode='blocked' then
  raise exception 'Sin acceso a la agenda institucional.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to>p_from+14 then
  raise exception 'Período inválido.' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'activity',s.activity,'starts_at',s.starts_at,'duration_minutes',s.duration_minutes,
  'resource',s.resource_label,
  'capacity',s.capacity,'reserved',coalesce(counts.n,0),
  'published',s.published_at is not null,'bookable', ((s.activity<>'flight' or exists(select 1 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id and a.registration=upper(s.resource_label) and a.availability='available' and a.archived_at is null)) and (s.activity<>'simulator' or exists(select 1 from public.aerosuite_simulators x where x.institution_id=p_institution_id and lower(x.name)=lower(s.resource_label) and x.availability='available' and x.archived_at is null)))
 ) order by s.starts_at,s.activity,s.resource_label),'[]'::jsonb) into v_slots
 from public.aerosuite_availability_slots s
 left join lateral (select count(*) n from public.aerosuite_activity_reservations r
   where r.slot_id=s.id and r.status in('pending','confirmed','completed')) counts on true
 where s.institution_id=p_institution_id and s.retired_at is null
 and s.starts_at>=p_from::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and s.starts_at<(p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and (v_role in('administrador','secretaria') or s.published_at is not null);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'slot_id',r.slot_id,'booking_id',r.booking_id,'student_id',
  case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then r.student_id else null end,
  'student_email',case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then u.email else null end,
  'my_booking',r.student_id=v_actor,'status',r.status,
  'with_instructor',case when v_role in('administrador','secretaria','instructor') or r.student_id=v_actor then coalesce(b.with_instructor,true) else null end,
  'starts_at',s.starts_at,'activity',s.activity
 ) order by s.starts_at),'[]'::jsonb) into v_reservations
 from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 left join public.aerosuite_flight_bookings b on b.id=r.booking_id
 left join auth.users u on u.id=r.student_id
 where r.institution_id=p_institution_id and r.status<>'cancelled'
 and s.starts_at>=p_from::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and s.starts_at<(p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
 and (v_role in('administrador','secretaria') or r.student_id=v_actor);
 return jsonb_build_object('slots',v_slots,'reservations',v_reservations);
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_booking_schedule(p_institution_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(booking_id uuid, starts_at timestamp with time zone, status text, my_booking boolean, student_id uuid, student_email text, instructor_id uuid, instructor_email text, aircraft text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid();v_role text;v_mode text;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','instructor','alumno','piloto','secretaria')
 limit 1;
 if v_role is null or v_mode='blocked' then raise exception 'No tenés acceso a esta institución.' using errcode='42501';end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_date_to>p_date_from+14
 then raise exception 'Período de consulta inválido.' using errcode='22023';end if;
 return query select case when v_role in ('administrador','secretaria','instructor') or b.student_id=v_actor then b.id else null::uuid end,b.starts_at,b.status,b.student_id=v_actor,
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
end;$function$;

CREATE OR REPLACE FUNCTION public.aerosuite_confirm_without_instructor(p_institution_id uuid, p_booking_id uuid, p_authorization_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
 v_booking public.aerosuite_flight_bookings%rowtype;
 v_slot public.aerosuite_availability_slots%rowtype;
 v_ref text:=btrim(coalesce(p_authorization_reference,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección o Secretaría pueden autorizar vuelos sin instructor.' using errcode='42501';end if;
 if length(v_ref) not between 8 and 250 then
  raise exception 'Indicá una referencia verificable de autorización (8 a 250 caracteres).' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_booking from public.aerosuite_flight_bookings
 where id=p_booking_id and institution_id=p_institution_id for update;
 if not found or v_booking.with_instructor or v_booking.status<>'pending' or v_booking.starts_at<=now()
 then raise exception 'Solo se pueden autorizar solicitudes futuras pendientes sin instructor.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id and pa.user_id=v_booking.student_id and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
 then raise exception 'No se puede confirmar un vuelo sin instructor: Piloto PPA no verificado por la institución.' using errcode='42501';end if;
 if exists(select 1 from public.aerosuite_flight_reports r where r.booking_id=v_booking.id)
 or exists(select 1 from public.aerosuite_flight_checkouts c where c.booking_id=v_booking.id)
 then raise exception 'El vuelo ya tiene informe o movimiento de caja.' using errcode='22023';end if;
 select s.* into v_slot from public.aerosuite_activity_reservations r
 join public.aerosuite_availability_slots s on s.id=r.slot_id
 where r.institution_id=p_institution_id and r.booking_id=v_booking.id and r.status='pending'
 and s.activity='flight' and s.published_at is not null and s.retired_at is null
 for update of s;
 if not found then raise exception 'No hay horario de vuelo publicado para esta reserva.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_aircraft_registry a
 where a.institution_id=p_institution_id and a.registration=upper(v_slot.resource_label)
 and a.availability='available' and a.archived_at is null)
 then raise exception 'La aeronave seleccionada no está disponible.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_flight_bookings b
 where b.institution_id=p_institution_id and b.id<>v_booking.id
 and b.status in('pending','confirmed','completed')
 and upper(coalesce(b.aircraft,''))=upper(v_slot.resource_label)
 and tstzrange(b.starts_at,b.starts_at+interval '90 minutes','[)') &&
     tstzrange(v_booking.starts_at,v_booking.starts_at+interval '90 minutes','[)'))
 then raise exception 'La aeronave tiene otra reserva superpuesta.' using errcode='23505';end if;
 update public.aerosuite_flight_bookings set status='confirmed',
  instructor_id=null,aircraft=upper(v_slot.resource_label),
  updated_by=v_actor,updated_at=now() where id=v_booking.id;
 insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,before_data,after_data)
 select p_institution_id,v_booking.id,v_actor,'solo_flight_authorized',to_jsonb(v_booking),
 to_jsonb(b)||jsonb_build_object('authorization_reference',v_ref,'verified_by_school',true)
 from public.aerosuite_flight_bookings b where b.id=v_booking.id;
 return jsonb_build_object('ok',true,'booking_id',v_booking.id,'status','confirmed',
  'with_instructor',false);
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_director_people(p_institution_id uuid)
 RETURNS TABLE(kind text, person_id uuid, email text, role text, situation text, registered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or p_institution_id is null then
  raise exception 'Iniciá sesión con una institución válida.' using errcode='42501';
 end if;
 if not exists(select 1 from public.aerosuite_superadmins sa where sa.user_id=v_user)
    and not exists(
      select 1 from public.aerosuite_institution_members manager
      where manager.institution_id=p_institution_id
        and manager.user_id=v_user and manager.role in ('administrador','secretaria')
    ) then
   raise exception 'Solo Dirección, Secretaría o Superadministración pueden consultar los integrantes.' using errcode='42501';
 end if;
 return query
 select 'integrante'::text,m.user_id,u.email::text,m.role,'activo'::text,m.assigned_at
 from public.aerosuite_institution_members m join auth.users u on u.id=m.user_id
 where m.institution_id=p_institution_id and m.role in ('secretaria','instructor','alumno','piloto')
 union all
 select 'invitacion'::text,inv.id,inv.email,inv.role,
   case when inv.expires_at<=now() then 'vencida'::text else 'pendiente'::text end,inv.created_at
 from public.aerosuite_institution_invitations inv
 where inv.institution_id=p_institution_id
  and inv.role in ('secretaria','instructor','alumno','piloto')
  and inv.accepted_at is null and inv.revoked_at is null
 order by 4,3,1
 limit 1000;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aerosuite_finance_snapshot(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_packs jsonb;v_money jsonb;
begin
 select m.role,private.aerosuite_access_mode(org.status,org.trial_ends_at,org.license_ends_at,now()) into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions org on org.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria','alumno','piloto') limit 1;
 if v_role is null or v_mode='blocked' then raise exception 'Sin acceso a la información económica.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'student_id',x.student_id,
  'student_email',u.email,'total_minutes',x.total_minutes,'used_minutes',x.used_minutes,
  'remaining_minutes',x.total_minutes-x.used_minutes,'paid_amount',x.paid_amount,'currency',x.currency,'created_at',x.created_at)
 order by x.created_at desc),'[]'::jsonb) into v_packs from (
 select pk.*,coalesce((select sum(usage.minutes) from public.aerosuite_pack_usages usage where usage.pack_id=pk.id),0) as used_minutes
 from public.aerosuite_hour_packs pk where pk.institution_id=p_institution_id and pk.voided_at is null
 and (v_role in ('administrador','secretaria') or pk.student_id=v_actor)
 ) x left join auth.users u on u.id=x.student_id;
 if v_role in ('administrador','secretaria') then
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'movement_type',m.movement_type,
 'student_id',m.student_id,'amount',m.amount,'currency',m.currency,
 'description',m.description,'expense_category',m.expense_category,
 'student_email',su.email,'created_by_email',cu.email,
 'payment_method',m.payment_method,
 'payment_reference',m.payment_reference,
 'fiscal_document_reference',m.fiscal_document_reference,
 'created_by',m.created_by,'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
 into v_money from (select * from public.aerosuite_money_movements where institution_id=p_institution_id order by created_at desc limit 150) m
 LEFT JOIN auth.users cu ON cu.id=m.created_by
 LEFT JOIN auth.users su ON su.id=m.student_id;
 else v_money:='[]'::jsonb;end if;
 return jsonb_build_object('packs',v_packs,'movements',v_money);
end;$function$;

CREATE OR REPLACE FUNCTION public.aerosuite_manage_staff_remove(p_institution_id uuid, p_person_id uuid, p_kind text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_super boolean;
 v_mode text; v_role text; v_email text; v_org record; v_changed int;
   v_candidate uuid; v_purged boolean:=false;
begin
 if v_actor is null or p_institution_id is null or p_person_id is null
  or p_kind not in ('integrante','invitacion') or p_role not in ('secretaria','instructor','alumno','piloto') then
  raise exception 'Solicitud de baja inválida.' using errcode='42501';
 end if;
 select exists(select 1 from public.aerosuite_superadmins sa where sa.user_id=v_actor) into v_super;
 if not v_super and not exists(
  select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria')
 ) then
  raise exception 'No podés dar de baja personal de otra institución.' using errcode='42501';
 end if;
 if p_role='secretaria' and not v_super and not exists(
  select 1 from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=v_actor and m.role='administrador'
 ) then
  raise exception 'Solo Dirección puede dar de baja el acceso de Secretaría.' using errcode='42501';
 end if;
 select org.status,org.trial_ends_at,org.license_ends_at into v_org
 from public.aerosuite_institutions org where org.id=p_institution_id;
 if not found then raise exception 'La institución no existe.' using errcode='42501'; end if;
 v_mode:=private.aerosuite_access_mode(v_org.status,v_org.trial_ends_at,v_org.license_ends_at,now());
 if not v_super and v_mode not in ('trial','grace','active') then
  raise exception 'En modo consulta o suspendida solo el Superadministrador puede realizar bajas de seguridad.' using errcode='42501';
 end if;
 if p_kind='integrante' then
  select m.role,u.email into v_role,v_email
  from public.aerosuite_institution_members m
  join auth.users u on u.id=m.user_id
  where m.institution_id=p_institution_id and m.user_id=p_person_id and m.role=p_role
  for update of m;
  if v_role is null then
   raise exception 'No existe este instructor o alumno en la institución indicada.' using errcode='42501';
  end if;
  if p_role='piloto' then
   update public.aerosuite_pilot_authorizations set status='revoked',updated_at=now()
   where institution_id=p_institution_id and user_id=p_person_id;
  end if;
  delete from public.aerosuite_institution_members m
  where m.institution_id=p_institution_id and m.user_id=p_person_id and m.role=p_role;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'No se pudo desvincular el rol solicitado.'; end if;
  update public.aerosuite_institution_invitations inv set revoked_at=now()
  where inv.institution_id=p_institution_id and inv.role=p_role and inv.revoked_at is null
  and lower(btrim(inv.email))=lower(btrim(v_email));
 else
  select inv.role,inv.email into v_role,v_email
  from public.aerosuite_institution_invitations inv
  where inv.id=p_person_id and inv.institution_id=p_institution_id
  and inv.role=p_role and inv.accepted_at is null and inv.revoked_at is null
  for update;
  if v_role is null then
   raise exception 'La invitación ya fue aceptada, revocada o no pertenece a esta escuela.' using errcode='42501';
  end if;
  update public.aerosuite_institution_invitations inv set revoked_at=now()
  where inv.id=p_person_id and inv.institution_id=p_institution_id
  and inv.role=p_role and inv.accepted_at is null and inv.revoked_at is null;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'No se pudo cancelar la invitación.'; end if;
 end if;
 insert into public.aerosuite_institution_audit
 (institution_id,operation,changed_by,before_data,after_data)
 values(p_institution_id,
  case when p_kind='integrante' then 'MEMBER_UNLINK' else 'INVITATION_REVOKE' end,
  v_actor,
  jsonb_build_object('role',p_role,'email',v_email),
  jsonb_build_object('role',p_role,'email',v_email,'removed',true,
                     'kind',p_kind,'performed_by',case when v_super then 'superadmin' else 'director' end));
 if exists(select 1 from public.aerosuite_institutions org
       where org.id=p_institution_id and org.is_test) then
    select u.id into v_candidate from auth.users u
     where lower(btrim(u.email))=lower(btrim(v_email))
     order by u.created_at desc limit 1;
    if v_candidate is not null and v_candidate<>v_actor
      and not exists(select 1 from public.aerosuite_institution_members m
       where m.institution_id=p_institution_id and m.user_id=v_candidate)
      and not exists(select 1 from public.aerosuite_institution_invitations i
       where i.institution_id=p_institution_id and lower(btrim(i.email))=lower(btrim(v_email))
        and i.role<>p_role and i.accepted_at is null and i.revoked_at is null)
      then
      v_purged:=private.aerosuite_purge_isolated_test_identity(p_institution_id,v_candidate);
      if v_purged then
       delete from public.aerosuite_institution_invitations x
         where x.institution_id=p_institution_id and lower(btrim(x.email))=lower(btrim(v_email))
         and x.role=p_role;
      end if;
    end if;
  end if;
  if exists(select 1 from public.aerosuite_institutions where id=p_institution_id and is_test) then
   delete from public.aerosuite_institution_invitations i
     where i.institution_id=p_institution_id and i.role=p_role
       and lower(btrim(i.email))=lower(btrim(v_email));
   delete from public.aerosuite_institution_audit a
     where a.institution_id=p_institution_id
       and (lower(btrim(a.before_data->>'email'))=lower(btrim(v_email))
         or lower(btrim(a.after_data->>'email'))=lower(btrim(v_email)));
  end if;
  return jsonb_build_object('ok',true,'role',p_role,'email',v_email,'kind',p_kind,
    'removed_test_account',v_purged);
end;
$function$;

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_candidates(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_allowed boolean;v_result jsonb;
begin
 select exists(select 1 from public.aerosuite_institution_members m
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria'))
 into v_allowed;
 if not v_allowed then raise exception 'Solo Dirección o Secretaría puede ver esta lista.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'user_id',m.user_id,'email',u.email,'name',concat_ws(' ',mp.given_names,mp.family_names),
 'license_type',d.license_type,'license_number',d.license_number,
 'verified',coalesce(pa.status='verified',false),
 'verified_at',pa.verified_at
 ) order by u.email),'[]'::jsonb) into v_result
 from public.aerosuite_institution_members m
 join auth.users u on u.id=m.user_id
 left join public.aerosuite_role_declarations d on d.user_id=m.user_id and d.role='pilot'
 left join public.aerosuite_member_profiles mp on mp.user_id=m.user_id
 left join public.aerosuite_pilot_authorizations pa on pa.institution_id=m.institution_id and pa.user_id=m.user_id
 where m.institution_id=p_institution_id and m.role='piloto';
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_profile(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_decl public.aerosuite_role_declarations%rowtype;
 v_verified boolean:=false;v_student boolean:=false;v_member boolean:=false;
begin
 if v_actor is null then raise exception 'Iniciá sesión.' using errcode='42501';end if;
 select exists(select 1 from public.aerosuite_institution_members m
   where m.institution_id=p_institution_id and m.user_id=v_actor and m.role='piloto')
 into v_member;
 if not v_member then raise exception 'No pertenecés a esta institución con acceso a la turnera.' using errcode='42501';end if;
 select * into v_decl from public.aerosuite_role_declarations d
 where d.user_id=v_actor and d.role='pilot';
 select exists(select 1 from public.aerosuite_role_declarations d
 where d.user_id=v_actor and d.role='student') into v_student;
 select exists(select 1 from public.aerosuite_pilot_authorizations p
 where p.institution_id=p_institution_id and p.user_id=v_actor and p.status='verified'
 and exists(select 1 from public.aerosuite_role_declarations d where d.user_id=v_actor
  and d.role='pilot' and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')) into v_verified;
 return jsonb_build_object(
  'pilot_declared',v_decl.user_id is not null,
  'pilot_ppa_declared',v_decl.user_id is not null and upper(coalesce(v_decl.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)',
  'student_declared',v_student,
  'pilot_verified',v_verified,
  'portal','pilot_ppa', 'license_type',coalesce(v_decl.license_type,''),
  'pilot_portal',true
 );
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_pilot_verify(p_institution_id uuid, p_user_id uuid, p_approved boolean, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_allowed boolean;v_ref text:=btrim(coalesce(p_reference,''));v_type text;
begin
 select exists(select 1 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria')
 and private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) in ('active','trial','grace')) into v_allowed;
 if not v_allowed then raise exception 'Solo Secretaría o Dirección habilitadas pueden verificar al piloto.' using errcode='42501';end if;
 if p_approved is null or length(v_ref) not between 8 and 250
 then raise exception 'Indicá una referencia documental válida de 8 a 250 caracteres.' using errcode='22023';end if;
 if not exists(select 1 from public.aerosuite_institution_members m
 where m.institution_id=p_institution_id and m.user_id=p_user_id and m.role='piloto')
 then raise exception 'La persona no está vinculada a la escuela.' using errcode='22023';end if;
 select d.license_type into v_type from public.aerosuite_role_declarations d
 where d.user_id=p_user_id and d.role='pilot';
 if p_approved and (not found or upper(coalesce(v_type,'')) !~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)') then
  raise exception 'La persona primero debe declarar en su ficha una licencia de Piloto PPA o Comercial.' using errcode='22023';end if;
 insert into public.aerosuite_pilot_authorizations(institution_id,user_id,status,verification_reference,verified_by,verified_at,updated_at)
 values(p_institution_id,p_user_id,case when p_approved then 'verified' else 'revoked' end,v_ref,v_actor,now(),now())
 on conflict(institution_id,user_id) do update set
 status=excluded.status,verification_reference=excluded.verification_reference,verified_by=excluded.verified_by,
 verified_at=excluded.verified_at,updated_at=now();
 return jsonb_build_object('ok',true,'pilot_verified',p_approved,'user_id',p_user_id);
end $function$;

CREATE OR REPLACE FUNCTION public.aerosuite_reserve_with_instructor(p_institution_id uuid, p_slot_id uuid, p_student_id uuid, p_with_instructor boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_slot public.aerosuite_availability_slots%rowtype;
 v_result jsonb;v_booking_id uuid;
begin
 if v_actor is null or p_with_instructor is null then
  raise exception 'Sesión y modalidad de vuelo requeridas.' using errcode='42501';end if;
 select * into v_slot from public.aerosuite_availability_slots s
 where s.id=p_slot_id and s.institution_id=p_institution_id and s.retired_at is null;
 if not found then raise exception 'Horario no encontrado o retirado.' using errcode='22023';end if;
 if v_slot.activity<>'flight' and p_with_instructor=false then
  raise exception 'La opción sin instructor solo corresponde a vuelos prácticos.' using errcode='22023';end if;
 if v_slot.activity='flight' and not p_with_instructor then
  if not exists(select 1 from public.aerosuite_pilot_authorizations pa
   join public.aerosuite_role_declarations d on d.user_id=pa.user_id and d.role='pilot'
   join public.aerosuite_institution_members mm on mm.institution_id=pa.institution_id and mm.user_id=pa.user_id and mm.role='piloto'
   where pa.institution_id=p_institution_id
   and pa.user_id=coalesce(p_student_id,v_actor) and pa.status='verified'
   and upper(coalesce(d.license_type,'')) ~ '(PPA|PILOTO PRIVADO|PCA|PILOTO COMERCIAL|COMERCIAL)')
  then raise exception 'Solo un Piloto PPA verificado por esta escuela puede reservar sin instructor. Completá tu ficha y solicitá la validación de Secretaría.' using errcode='42501';end if;
 end if;
 v_result:=public.aerosuite_availability_reserve(p_institution_id,p_slot_id,p_student_id);
 v_booking_id:=nullif(v_result->>'booking_id','')::uuid;
 if v_slot.activity='flight' then
  if v_booking_id is null then raise exception 'No se creó el vuelo.' using errcode='22023';end if;
  update public.aerosuite_flight_bookings set with_instructor=p_with_instructor,
   updated_at=now(),updated_by=v_actor where id=v_booking_id and institution_id=p_institution_id;
  insert into public.aerosuite_flight_booking_audit(institution_id,booking_id,actor_id,event,after_data)
  values(p_institution_id,v_booking_id,v_actor,'instructor_mode_selected',
   jsonb_build_object('with_instructor',p_with_instructor,'requires_school_authorization',not p_with_instructor));
 end if;
 return v_result||jsonb_build_object('with_instructor',p_with_instructor,
  'requires_school_authorization',v_slot.activity='flight' and not p_with_instructor);
end $function$;

revoke all on function public.aerosuite_pilot_profile(uuid) from public,anon;
grant execute on function public.aerosuite_pilot_profile(uuid) to authenticated;
revoke all on function public.aerosuite_pilot_candidates(uuid) from public,anon;
grant execute on function public.aerosuite_pilot_candidates(uuid) to authenticated;
revoke all on function public.aerosuite_pilot_verify(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.aerosuite_pilot_verify(uuid,uuid,boolean,text) to authenticated;
revoke all on function public.aerosuite_reserve_with_instructor(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.aerosuite_reserve_with_instructor(uuid,uuid,uuid,boolean) to authenticated;
revoke all on function public.aerosuite_confirm_without_instructor(uuid,uuid,text) from public,anon;
grant execute on function public.aerosuite_confirm_without_instructor(uuid,uuid,text) to authenticated;
