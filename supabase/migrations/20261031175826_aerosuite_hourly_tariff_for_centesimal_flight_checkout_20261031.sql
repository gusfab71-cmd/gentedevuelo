
-- Exported from live Supabase functions for reproducible version control.
create table if not exists public.aerosuite_hourly_tariffs (
 institution_id uuid primary key references public.aerosuite_institutions(id) on delete cascade,
 amount numeric(14,2) not null check (amount>0 and amount<=1000000000000),
 currency text not null check (currency in ('ARS','USD')),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
alter table public.aerosuite_hourly_tariffs enable row level security;
revoke all on public.aerosuite_hourly_tariffs from public,anon,authenticated;
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_hourly_tariff_get(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;v_rate public.aerosuite_hourly_tariffs%rowtype;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria');
 if v_actor is null or v_role is null or v_mode='blocked' then
  raise exception 'Sin acceso a la tarifa de esta institución.' using errcode='42501';
 end if;
 select * into v_rate from public.aerosuite_hourly_tariffs where institution_id=p_institution_id;
 if not found then return jsonb_build_object('configured',false,'amount',null,'currency','ARS');end if;
 return jsonb_build_object('configured',true,'amount',v_rate.amount,'currency',v_rate.currency,'updated_at',v_rate.updated_at);
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_hourly_tariff_set(p_institution_id uuid, p_amount numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_role text;v_mode text;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_role,v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria');
 if v_actor is null or v_role is null or v_mode not in ('trial','grace','active') then
  raise exception 'Solo Dirección o Secretaría pueden definir tarifas.' using errcode='42501';
 end if;
 if p_amount is null or p_amount<=0 or p_amount>1000000000000 or round(p_amount,2)<>p_amount or p_currency not in ('ARS','USD') then
  raise exception 'Ingresá un valor horario positivo y moneda válida.' using errcode='22023';
 end if;
 insert into public.aerosuite_hourly_tariffs(institution_id,amount,currency,updated_at,updated_by)
 values(p_institution_id,p_amount,p_currency,now(),v_actor)
 on conflict(institution_id) do update set amount=excluded.amount,currency=excluded.currency,updated_at=now(),updated_by=v_actor;
 return jsonb_build_object('ok',true,'amount',p_amount,'currency',p_currency);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_hourly_tariff_get(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_hourly_tariff_get(p_institution_id)
$function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_hourly_tariff_set(p_institution_id uuid, p_amount numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_hourly_tariff_set(p_institution_id,p_amount,p_currency)
$function$
;
revoke all on function public.aerosuite_hourly_tariff_get(uuid),public.aerosuite_hourly_tariff_set(uuid,numeric,text) from public,anon;
grant execute on function public.aerosuite_hourly_tariff_get(uuid),public.aerosuite_hourly_tariff_set(uuid,numeric,text) to authenticated;
