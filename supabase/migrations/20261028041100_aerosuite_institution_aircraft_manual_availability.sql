
-- AeroSuite: ficha de flota institucional, disponibilidad manual sin habilitación técnica automática.
create table public.aerosuite_aircraft_registry (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 registration text not null check(length(btrim(registration)) between 3 and 18),
 model text not null default '',
 availability text not null default 'available' check(availability in ('available','out_of_service')),
 remarks text not null default '',
 created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(institution_id,registration)
);
create table public.aerosuite_aircraft_changes (
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 aircraft_id uuid not null references public.aerosuite_aircraft_registry(id) on delete cascade,
 actor_id uuid not null,
 before_data jsonb,after_data jsonb,
 created_at timestamptz not null default now()
);
alter table public.aerosuite_aircraft_registry enable row level security;
alter table public.aerosuite_aircraft_changes enable row level security;
revoke all on public.aerosuite_aircraft_registry,public.aerosuite_aircraft_changes from anon,authenticated;
create or replace function public.aerosuite_aircraft_list(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_mode text;v_result jsonb;
begin
 select private.aerosuite_access_mode(o.status,o.trial_ends_at,o.license_ends_at,now())
 into v_mode from public.aerosuite_institutions o join public.aerosuite_institution_members m on m.institution_id=o.id
 where o.id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria','instructor') limit 1;
 if v_mode is null or v_mode='blocked' then raise exception 'Sin acceso a flota.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.registration),'[]'::jsonb) into v_result
 from public.aerosuite_aircraft_registry a where a.institution_id=p_institution_id;
 return v_result;
end;$fn$;
create or replace function public.aerosuite_aircraft_action(
 p_institution_id uuid,p_operation text,p_aircraft_id uuid default null,p_registration text default null,
 p_model text default null,p_availability text default null,p_remarks text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_mode text;v_row public.aerosuite_aircraft_registry%rowtype;v_id uuid;
begin
 select private.aerosuite_access_mode(o.status,o.trial_ends_at,o.license_ends_at,now())
 into v_mode from public.aerosuite_institutions o join public.aerosuite_institution_members m on m.institution_id=o.id
 where o.id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria') limit 1;
 if v_mode not in ('trial','grace','active') or v_mode is null then raise exception 'Solo Administración puede actualizar flota.' using errcode='42501';end if;
 if p_operation='create' then
  if length(btrim(coalesce(p_registration,''))) not between 3 and 18 then raise exception 'Ingresá matrícula válida.' using errcode='22023';end if;
  insert into public.aerosuite_aircraft_registry(institution_id,registration,model,remarks,created_by,updated_by)
  values(p_institution_id,upper(btrim(p_registration)),left(btrim(coalesce(p_model,'')),100),left(btrim(coalesce(p_remarks,'')),300),v_actor,v_actor)
  returning id into v_id;
  insert into public.aerosuite_aircraft_changes(institution_id,aircraft_id,actor_id,after_data)
   select p_institution_id,v_id,v_actor,to_jsonb(a) from public.aerosuite_aircraft_registry a where a.id=v_id;
 elsif p_operation='status' then
  if p_availability not in ('available','out_of_service') then raise exception 'Estado de disponibilidad inválido.' using errcode='22023';end if;
  select * into v_row from public.aerosuite_aircraft_registry where institution_id=p_institution_id and id=p_aircraft_id for update;
  if not found then raise exception 'Aeronave no registrada.' using errcode='P0002';end if;
  update public.aerosuite_aircraft_registry set availability=p_availability,remarks=left(btrim(coalesce(p_remarks,'')),300),
  updated_by=v_actor,updated_at=now() where id=p_aircraft_id;
  insert into public.aerosuite_aircraft_changes(institution_id,aircraft_id,actor_id,before_data,after_data)
   select p_institution_id,p_aircraft_id,v_actor,to_jsonb(v_row),to_jsonb(a) from public.aerosuite_aircraft_registry a where a.id=p_aircraft_id;
  v_id:=p_aircraft_id;
 else raise exception 'Acción de flota desconocida.' using errcode='22023';end if;
 return jsonb_build_object('ok',true,'aircraft_id',v_id,'action',p_operation);
end;$fn$;
revoke all on function public.aerosuite_aircraft_list(uuid),public.aerosuite_aircraft_action(uuid,text,uuid,text,text,text,text) from public,anon;
grant execute on function public.aerosuite_aircraft_list(uuid),public.aerosuite_aircraft_action(uuid,text,uuid,text,text,text,text) to authenticated;
