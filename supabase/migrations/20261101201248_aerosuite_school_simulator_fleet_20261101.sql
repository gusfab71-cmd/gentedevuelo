-- Simuladores: recursos propios para la turnera, separados de las aeronaves y del mantenimiento.
create table if not exists public.aerosuite_simulators (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 name text not null check (length(btrim(name)) between 2 and 90),
 model text not null default '' check (length(model)<=100),
 availability text not null default 'available' check (availability in ('available','out_of_service')),
 out_of_service_reason text not null default '',
 archived_at timestamptz,
 archived_reason text not null default '',
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
create unique index if not exists aerosuite_simulators_institution_name_ci
 on public.aerosuite_simulators(institution_id,lower(name));
create index if not exists aerosuite_simulators_inst on public.aerosuite_simulators(institution_id,availability);
alter table public.aerosuite_simulators enable row level security;
revoke all on public.aerosuite_simulators from public,anon,authenticated;

create table if not exists public.aerosuite_simulator_audit(
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 simulator_id uuid not null references public.aerosuite_simulators(id) on delete restrict,
 actor_id uuid not null references auth.users(id),
 event text not null,
 reason text not null default '',
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index if not exists aerosuite_simulator_audit_inst on public.aerosuite_simulator_audit(institution_id,created_at desc);
alter table public.aerosuite_simulator_audit enable row level security;
revoke all on public.aerosuite_simulator_audit from public,anon,authenticated;

create or replace function public.aerosuite_simulator_list(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid(); v_mode text; v_result jsonb;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria','instructor') limit 1;
 if v_actor is null or v_mode is null or v_mode='blocked' then
  raise exception 'No autorizado a consultar simuladores.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]'::jsonb) into v_result
 from public.aerosuite_simulators s where s.institution_id=p_institution_id;
 return v_result;
end $fn$;
revoke all on function public.aerosuite_simulator_list(uuid) from public,anon;
grant execute on function public.aerosuite_simulator_list(uuid) to authenticated;

create or replace function public.aerosuite_simulator_action(
 p_institution_id uuid,p_action text,
 p_simulator_id uuid default null,p_name text default null,
 p_model text default null,p_reason text default null
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid(); v_mode text;
 v_id uuid;v_sim public.aerosuite_simulators%rowtype;
 v_prev jsonb;v_after jsonb;
 v_name text:=btrim(coalesce(p_name,''));
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Dirección y Secretaría pueden gestionar simuladores.' using errcode='42501';end if;
 if p_action not in('create','out_of_service','available','archive','restore') then
  raise exception 'Acción de simulador inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 if p_action='create' then
  if length(v_name) not between 2 and 90 or length(coalesce(p_model,''))>100 then
   raise exception 'Completá el nombre del simulador (2 a 90 caracteres).' using errcode='22023';end if;
  if exists(select 1 from public.aerosuite_simulators s
    where s.institution_id=p_institution_id and lower(s.name)=lower(v_name)) then
   raise exception 'Ya existe un simulador con ese nombre. Si fue archivado, reincorporalo.' using errcode='23505';end if;
  insert into public.aerosuite_simulators(institution_id,name,model,created_by,updated_by)
  values(p_institution_id,v_name,btrim(coalesce(p_model,'')),v_actor,v_actor) returning id into v_id;
  v_prev:=null;
 else
  select * into v_sim from public.aerosuite_simulators
   where id=p_simulator_id and institution_id=p_institution_id for update;
  if not found then raise exception 'El simulador no existe en esta institución.' using errcode='P0002';end if;
  v_id:=v_sim.id;v_prev:=to_jsonb(v_sim);
  if p_action='archive' then
   if v_sim.archived_at is not null then raise exception 'Este simulador ya está archivado.' using errcode='22023';end if;
   if length(v_reason)<5 or length(v_reason)>300 then raise exception 'Indicá un motivo de baja (5 a 300 caracteres).' using errcode='22023';end if;
   update public.aerosuite_simulators set archived_at=now(),archived_reason=v_reason,
    availability='out_of_service',out_of_service_reason=v_reason,
    updated_by=v_actor,updated_at=now() where id=v_id;
  elsif p_action='restore' then
   if v_sim.archived_at is null then raise exception 'El simulador no está archivado.' using errcode='22023';end if;
   update public.aerosuite_simulators set archived_at=null,archived_reason='',
    availability='out_of_service',updated_by=v_actor,updated_at=now() where id=v_id;
  else
   if v_sim.archived_at is not null then raise exception 'Primero reincorporá el simulador archivado.' using errcode='22023';end if;
   if length(v_reason)<5 or length(v_reason)>300 then
    raise exception 'Indicá el motivo del cambio (5 a 300 caracteres).' using errcode='22023';end if;
   update public.aerosuite_simulators
   set availability=case when p_action='available' then 'available' else 'out_of_service' end,
       out_of_service_reason=case when p_action='available' then '' else v_reason end,
       updated_by=v_actor,updated_at=now()
   where id=v_id;
  end if;
 end if;
 select to_jsonb(s) into v_after from public.aerosuite_simulators s where s.id=v_id;
 insert into public.aerosuite_simulator_audit(institution_id,simulator_id,actor_id,event,reason,before_data,after_data)
 values(p_institution_id,v_id,v_actor,p_action,v_reason,v_prev,v_after);
 return jsonb_build_object('ok',true,'simulator_id',v_id,'action',p_action,'name',v_after->>'name');
end $fn$;
revoke all on function public.aerosuite_simulator_action(uuid,text,uuid,text,text,text) from public,anon;
grant execute on function public.aerosuite_simulator_action(uuid,text,uuid,text,text,text) to authenticated;
