-- AeroSuite institutional maintenance. The private gdv_aircraft_maintenance table is untouched.
create table if not exists public.aerosuite_institution_maintenance (
 institution_id uuid primary key references public.aerosuite_institutions(id) on delete cascade,
 payload jsonb not null default '{"ac":[],"sv":[],"ct":[],"lg":[],"rc":[],"mx":[],"ad":[],"ip":[],"ie":[],"dx":[],"inv":[],"mv":[],"fuel":[],"sel":null,"tab":"a","hz":12}'::jsonb,
 revision bigint not null default 0 check(revision>=0),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 constraint aerosuite_maintenance_object check(jsonb_typeof(payload)='object')
);
create table if not exists public.aerosuite_institution_maintenance_audit(
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 from_revision bigint not null,
 to_revision bigint not null,
 actor_id uuid not null references auth.users(id),
 changed_at timestamptz not null default now()
);
create index if not exists aerosuite_maintenance_audit_inst_date
 on public.aerosuite_institution_maintenance_audit(institution_id,changed_at desc);
alter table public.aerosuite_institution_maintenance enable row level security;
alter table public.aerosuite_institution_maintenance_audit enable row level security;
revoke all on public.aerosuite_institution_maintenance,public.aerosuite_institution_maintenance_audit from public,anon,authenticated;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_institution_maintenance_get(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_mode text;v_record public.aerosuite_institution_maintenance%rowtype;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=auth.uid()
 and m.role in('administrador','secretaria','instructor');
 if auth.uid() is null or v_role is null or (v_mode is null or v_mode='blocked') then
  raise exception 'Sin acceso al mantenimiento institucional.' using errcode='42501';
 end if;
 select * into v_record from public.aerosuite_institution_maintenance
 where institution_id=p_institution_id;
 if not found then
  return jsonb_build_object('payload',null,'revision',0,'updated_at',null,
   'can_write',v_role in('administrador','secretaria') and v_mode in('trial','grace','active'));
 end if;
 return jsonb_build_object('payload',v_record.payload,'revision',v_record.revision,
  'updated_at',v_record.updated_at,'can_write',
  v_role in('administrador','secretaria') and v_mode in('trial','grace','active'));
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_institution_maintenance_save(p_institution_id uuid, p_payload jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;v_mode text;v_revision bigint;v_new bigint;v_count int;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=auth.uid()
 and m.role in('administrador','secretaria');
 if auth.uid() is null or v_role is null or (v_mode is null or v_mode not in('trial','grace','active')) then
  raise exception 'Solo Dirección/Secretaría con licencia activa puede guardar mantenimiento.' using errcode='42501';
 end if;
 if p_expected_revision is null or p_expected_revision<0 or jsonb_typeof(p_payload)<>'object'
 or octet_length(p_payload::text)>5000000 then
  raise exception 'Datos de mantenimiento inválidos o demasiado extensos.' using errcode='22023';
 end if;
 if not (p_payload ? 'ac') or jsonb_typeof(p_payload->'ac')<>'array'
 or jsonb_array_length(p_payload->'ac')>50 then
  raise exception 'La nómina del módulo de mantenimiento no es válida.' using errcode='22023';
 end if;
 if exists(
  select 1 from jsonb_array_elements(p_payload->'ac') a
  where not exists(
   select 1 from public.aerosuite_aircraft_registry f
   where f.institution_id=p_institution_id
   and upper(btrim(f.registration))=upper(btrim(a->>'reg'))
  )
 ) then
  raise exception 'Todas las matrículas de mantenimiento deben existir en la flota institucional.' using errcode='22023';
 end if;
 -- Instalar una fila sin datos si aún no existía. FOR UPDATE serializa escritores.
 insert into public.aerosuite_institution_maintenance(institution_id)
 values(p_institution_id) on conflict(institution_id) do nothing;
 select revision into v_revision from public.aerosuite_institution_maintenance
 where institution_id=p_institution_id for update;
 if v_revision<>p_expected_revision then
  raise exception 'Los datos de mantenimiento cambiaron en otra sesión. Recargá antes de guardar.' using errcode='40001';
 end if;
 v_new:=v_revision+1;
 update public.aerosuite_institution_maintenance
 set payload=p_payload,revision=v_new,updated_by=auth.uid(),updated_at=now()
 where institution_id=p_institution_id;
 insert into public.aerosuite_institution_maintenance_audit(institution_id,from_revision,to_revision,actor_id)
 values(p_institution_id,v_revision,v_new,auth.uid());
 return jsonb_build_object('ok',true,'revision',v_new,'saved_at',now());
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_institution_maintenance_get(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_institution_maintenance_get(p_institution_id)
$function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_institution_maintenance_save(p_institution_id uuid, p_payload jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_institution_maintenance_save(p_institution_id,p_payload,p_expected_revision)
$function$
;
revoke all on function
 public.aerosuite_institution_maintenance_get(uuid),
 public.aerosuite_institution_maintenance_save(uuid,jsonb,bigint),
 aerosuite_internal.aerosuite_institution_maintenance_get(uuid),
 aerosuite_internal.aerosuite_institution_maintenance_save(uuid,jsonb,bigint)
 from public,anon;
grant execute on function
 public.aerosuite_institution_maintenance_get(uuid),
 public.aerosuite_institution_maintenance_save(uuid,jsonb,bigint),
 aerosuite_internal.aerosuite_institution_maintenance_get(uuid),
 aerosuite_internal.aerosuite_institution_maintenance_save(uuid,jsonb,bigint)
 to authenticated;
