
-- Proyecto exclusivo de laboratorio (djvjaxkukephniwixpra). NUNCA aplicar a producción.
-- Contratos relacionales de prueba. No es copia de funciones productivas.
create extension if not exists btree_gist with schema extensions;
create schema if not exists aerosuite_lab;
revoke all on schema aerosuite_lab from public, anon, authenticated;
grant usage on schema aerosuite_lab to authenticated;

create table if not exists aerosuite_lab.members(
 id uuid primary key, institution_id uuid not null,
 role text not null check(role in ('director','secretaria','instructor','alumno','ppa','pca')),
 verified boolean not null default false
);
create table if not exists aerosuite_lab.aircraft(
 id uuid primary key, institution_id uuid not null,
 registration text not null unique check(registration ~ '^LV-[A-Z0-9]+$'),
 available boolean not null default true,
 current_hours numeric not null default 0 check(current_hours>=0),
 maintenance_due_hours numeric not null default 100 check(maintenance_due_hours>0)
);
create table if not exists aerosuite_lab.bookings(
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 student_id uuid not null references aerosuite_lab.members(id),
 instructor_id uuid references aerosuite_lab.members(id),
 aircraft_id uuid not null references aerosuite_lab.aircraft(id),
 starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'confirmed' check(status in ('pending','confirmed','completed','cancelled')),
 constraint lab_90_minutes check(ends_at=starts_at+interval '90 minutes'),
 constraint lab_aircraft_overlap exclude using gist
 (aircraft_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
 where (status in ('pending','confirmed','completed')),
 constraint lab_student_overlap exclude using gist
 (student_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
 where (status in ('pending','confirmed','completed')),
 constraint lab_instructor_overlap exclude using gist
 (instructor_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
 where (instructor_id is not null and status in ('pending','confirmed','completed'))
);
create table if not exists aerosuite_lab.reports(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references aerosuite_lab.bookings(id),
 instructor_id uuid not null references aerosuite_lab.members(id),
 flight_minutes integer not null check(flight_minutes between 1 and 90),
 landings integer not null check(landings between 0 and 30),
 status text not null default 'submitted' check(status in ('submitted','returned','approved'))
);
create table if not exists aerosuite_lab.packs(
 id uuid primary key,student_id uuid not null references aerosuite_lab.members(id),
 total_minutes integer not null check(total_minutes>0)
);
create table if not exists aerosuite_lab.pack_usages(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references aerosuite_lab.bookings(id),
 pack_id uuid not null references aerosuite_lab.packs(id),
 minutes integer not null check(minutes>0)
);
create table if not exists aerosuite_lab.checkouts(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references aerosuite_lab.bookings(id),
 payment_method text not null check(payment_method in ('cash','pack')),
 amount_cents bigint not null default 0 check(amount_cents>=0),
 minutes integer not null check(minutes between 1 and 90),
 created_at timestamptz not null default now()
);
create table if not exists public.aerosuite_lab_audit_summaries(
 id bigint generated always as identity primary key,
 run_at timestamptz not null default now(),
 checked_count integer not null check(checked_count>=0),
 passed_count integer not null check(passed_count>=0),
 failed_count integer not null check(failed_count>=0),
 status text not null check(status in ('PASS_SIMULATION','FAIL_SIMULATION')),
 cases jsonb not null default '[]'::jsonb,
 description text not null default 'Pruebas de contratos de laboratorio, no E2E de los portales'
);
alter table public.aerosuite_lab_audit_summaries enable row level security;
revoke all on public.aerosuite_lab_audit_summaries from public,anon,authenticated;
grant select on public.aerosuite_lab_audit_summaries to anon,authenticated;
create policy "lectura_de_resumen_ficticio" on public.aerosuite_lab_audit_summaries
 for select to anon,authenticated using(true);

-- Los datos técnicos no están disponibles mediante la API pública.
alter table aerosuite_lab.members enable row level security;
alter table aerosuite_lab.aircraft enable row level security;
alter table aerosuite_lab.bookings enable row level security;
alter table aerosuite_lab.reports enable row level security;
alter table aerosuite_lab.packs enable row level security;
alter table aerosuite_lab.pack_usages enable row level security;
alter table aerosuite_lab.checkouts enable row level security;
grant select on aerosuite_lab.members,aerosuite_lab.bookings to authenticated;
create policy "persona_consulta_su_rol" on aerosuite_lab.members for select to authenticated using(id=(select auth.uid()));
create policy "persona_consulta_reservas_de_su_institucion"
 on aerosuite_lab.bookings for select to authenticated using(
  exists(select 1 from aerosuite_lab.members m
    where m.id=(select auth.uid()) and m.institution_id=bookings.institution_id)
 );

create or replace function aerosuite_lab.reserve(
 p_person uuid,p_instructor uuid,p_aircraft uuid,p_start timestamptz,p_duration integer default 90
) returns uuid language plpgsql security invoker set search_path='' as $fn$
declare p aerosuite_lab.members%rowtype; a aerosuite_lab.aircraft%rowtype;
  i aerosuite_lab.members%rowtype; new_id uuid;
begin
 select * into p from aerosuite_lab.members where id=p_person;
 if not found or p.role not in ('alumno','ppa','pca') then raise exception 'Titular inválido';end if;
 select * into a from aerosuite_lab.aircraft where id=p_aircraft;
 if not found or a.institution_id<>p.institution_id then raise exception 'Aeronave no autorizada';end if;
 if not a.available or a.current_hours>=a.maintenance_due_hours then
  raise exception 'Aeronave fuera de servicio o mantenimiento vencido';
 end if;
 if p_duration<>90 then raise exception 'Reserva de laboratorio requiere 90 minutos';end if;
 if p.role in ('ppa','pca') and not p.verified then raise exception 'Piloto sin verificación';end if;
 if p.role='alumno' and p_instructor is null then raise exception 'Alumno requiere instructor';end if;
 if p_instructor is not null then
  select * into i from aerosuite_lab.members where id=p_instructor;
  if not found or i.role<>'instructor' or not i.verified or i.institution_id<>p.institution_id then
   raise exception 'Instructor no habilitado para la institución';
  end if;
 end if;
 insert into aerosuite_lab.bookings(institution_id,student_id,instructor_id,aircraft_id,starts_at,ends_at)
 values(p.institution_id,p_person,p_instructor,p_aircraft,p_start,p_start+interval '90 minutes') returning id into new_id;
 return new_id;
end;$fn$;

create or replace function aerosuite_lab.report(
 p_booking uuid,p_instructor uuid,p_minutes integer,p_landings integer
) returns uuid language plpgsql security invoker set search_path='' as $fn$
declare b aerosuite_lab.bookings%rowtype; new_id uuid;
begin
 select * into b from aerosuite_lab.bookings where id=p_booking;
 if not found or b.instructor_id is distinct from p_instructor then raise exception 'Instructor ajeno al vuelo';end if;
 if b.status<>'confirmed' or b.ends_at>now() then raise exception 'Vuelo aún no finalizado o no confirmado';end if;
 insert into aerosuite_lab.reports(booking_id,instructor_id,flight_minutes,landings)
 values(p_booking,p_instructor,p_minutes,p_landings) returning id into new_id;
 return new_id;
end;$fn$;

create or replace function aerosuite_lab.settle(
 p_booking uuid,p_method text,p_pack uuid default null,p_amount bigint default 0
) returns uuid language plpgsql security invoker set search_path='' as $fn$
declare b aerosuite_lab.bookings%rowtype; p aerosuite_lab.packs%rowtype;
 used_minutes integer; new_id uuid;
begin
 select * into b from aerosuite_lab.bookings where id=p_booking;
 if not found or b.status not in ('confirmed','completed') then raise exception 'Reserva no liquidable';end if;
 if exists(select 1 from aerosuite_lab.checkouts c where c.booking_id=p_booking) then raise exception 'Cobro duplicado';end if;
 if p_method='pack' then
  select * into p from aerosuite_lab.packs where id=p_pack for update;
  if not found or p.student_id<>b.student_id then raise exception 'Pack no pertenece al titular';end if;
  select coalesce(sum(minutes),0) into used_minutes from aerosuite_lab.pack_usages where pack_id=p_pack;
  if used_minutes+90>p.total_minutes then raise exception 'Pack sin minutos suficientes';end if;
  insert into aerosuite_lab.pack_usages(booking_id,pack_id,minutes) values(p_booking,p_pack,90);
  p_amount:=0;
 elsif p_method='cash' then
  if p_amount<=0 then raise exception 'Importe inválido';end if;
 else raise exception 'Medio de pago inválido';
 end if;
 insert into aerosuite_lab.checkouts(booking_id,payment_method,amount_cents,minutes)
 values(p_booking,p_method,p_amount,90) returning id into new_id;
 return new_id;
end;$fn$;

create or replace function aerosuite_lab.run_weekly()
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 inst uuid:='11111111-1111-4111-8111-111111111111';
 other_inst uuid:='22222222-2222-4222-8222-222222222222';
 student uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 student2 uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 teacher uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 pilot uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 outsider uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 plane uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 plane2 uuid:='99999999-9999-4999-8999-999999999999';
 v_start timestamptz:=date_trunc('day',now()-interval '3 days')+interval '12 hours';
 booked uuid; booked2 uuid; packid uuid:='88888888-8888-4888-8888-888888888888';
 j jsonb:='[]'::jsonb; success boolean; err text; v_total integer; v_pass integer; v_fail integer;
begin
 -- Borrar únicamente datos sintéticos del SEGUNDO PROYECTO Supabase.
 truncate aerosuite_lab.checkouts,aerosuite_lab.pack_usages,aerosuite_lab.packs,
   aerosuite_lab.reports,aerosuite_lab.bookings,aerosuite_lab.aircraft,aerosuite_lab.members;
 insert into aerosuite_lab.members(id,institution_id,role,verified) values
 (student,inst,'alumno',false),(student2,inst,'alumno',false),
 (teacher,inst,'instructor',true),(pilot,inst,'ppa',false),
 (outsider,other_inst,'alumno',false);
 insert into aerosuite_lab.aircraft(id,institution_id,registration,available,current_hours,maintenance_due_hours)
 values(plane,inst,'LV-TST',true,10,50),(plane2,inst,'LV-BLK',false,49,50);
 insert into aerosuite_lab.packs(id,student_id,total_minutes) values(packid,student,90);
 -- Happy path.
 success:=true;err:='';
 begin
  booked:=aerosuite_lab.reserve(student,teacher,plane,v_start,90);
  if booked is null then success:=false;end if;
 exception when others then success:=false;err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Reserva de 90 min','pass',success,'error',err));
 -- Restricción de duración menor
 success:=false;err:='';
 begin
  perform aerosuite_lab.reserve(student2,teacher,plane,v_start+interval '3 hours',60);
 exception when raise_exception then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Rechazo de turno inferior a 90 min','pass',success,'error',err));
 -- Solapamiento de aeronave
 success:=false;err:='';
 begin
  perform aerosuite_lab.reserve(student2,teacher,plane,v_start+interval '30 minutes',90);
 exception when exclusion_violation then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Bloqueo de aeronave superpuesta','pass',success,'error',err));
 -- Aeronave bloqueada
 success:=false;err:='';
 begin
  perform aerosuite_lab.reserve(student2,teacher,plane2,v_start+interval '3 hours',90);
 exception when raise_exception then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Bloqueo por aeronave fuera de servicio','pass',success,'error',err));
 -- PPA no verificado
 success:=false;err:='';
 begin
  perform aerosuite_lab.reserve(pilot,null,plane,v_start+interval '3 hours',90);
 exception when raise_exception then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','PPA sin habilitación institucional','pass',success,'error',err));
 -- Prohibir instructor de otra escuela
 success:=false;err:='';
 begin
  perform aerosuite_lab.reserve(outsider,teacher,plane,v_start+interval '5 hours',90);
 exception when raise_exception then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Aislamiento entre instituciones','pass',success,'error',err));
 -- Instructor asignado al informe
 success:=false;err:='';
 begin
  perform aerosuite_lab.report(booked,outsider,60,2);
 exception when raise_exception then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Informe de instructor ajeno rechazado','pass',success,'error',err));
 success:=true;err:='';
 begin
  perform aerosuite_lab.report(booked,teacher,60,2);
 exception when others then success:=false;err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Informe vinculado a reserva e instructor','pass',success,'error',err));
 -- Pack y cobro
 success:=true;err:='';
 begin
  perform aerosuite_lab.settle(booked,'pack',packid);
 exception when others then success:=false;err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Liquidación por pack ficticio','pass',success,'error',err));
 success:=false;err:='';
 begin
  perform aerosuite_lab.settle(booked,'cash',null,90000);
 exception when raise_exception then success:=true;when unique_violation then success:=true;when others then err:=sqlerrm;end;
 j:=j||jsonb_build_array(jsonb_build_object('name','Bloqueo de doble liquidación','pass',success,'error',err));
 select count(*),count(*) filter (where (value->>'pass')::boolean),
        count(*) filter (where not (value->>'pass')::boolean)
 into v_total,v_pass,v_fail from jsonb_array_elements(j) value;
 insert into public.aerosuite_lab_audit_summaries(checked_count,passed_count,failed_count,status,cases)
 values(v_total,v_pass,v_fail,case when v_fail=0 then 'PASS_SIMULATION' else 'FAIL_SIMULATION' end,j);
 return jsonb_build_object('checked',v_total,'passed',v_pass,'failed',v_fail,'status',case when v_fail=0 then 'PASS_SIMULATION' else 'FAIL_SIMULATION' end);
end;$fn$;
-- Solo postgres/rol técnico de la base ejecuta operaciones del laboratorio.
revoke all on function aerosuite_lab.reserve(uuid,uuid,uuid,timestamptz,integer) from public,anon,authenticated;
revoke all on function aerosuite_lab.report(uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function aerosuite_lab.settle(uuid,text,uuid,bigint) from public,anon,authenticated;
revoke all on function aerosuite_lab.run_weekly() from public,anon,authenticated;
