
-- Obligaciones mensuales: nunca se registran como pagadas sin una confirmación por período.
create table if not exists public.aerosuite_fixed_expense_rules(
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 description text not null check(length(btrim(description)) between 3 and 250),
 category text not null check(length(btrim(category)) between 2 and 90),
 amount numeric(14,2) not null check(amount>0 and amount<=1000000000000),
 currency text not null check(currency in ('ARS','USD')),
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists aerosuite_fixed_rules_by_inst on public.aerosuite_fixed_expense_rules(institution_id,active);
alter table public.aerosuite_fixed_expense_rules enable row level security;
revoke all on public.aerosuite_fixed_expense_rules from public,anon,authenticated;
create table if not exists public.aerosuite_fixed_expense_payments(
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 rule_id uuid not null references public.aerosuite_fixed_expense_rules(id) on delete restrict,
 expense_month date not null check(extract(day from expense_month)=1),
 movement_id uuid not null unique references public.aerosuite_money_movements(id) on delete restrict,
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 unique(rule_id,expense_month)
);
alter table public.aerosuite_fixed_expense_payments enable row level security;
revoke all on public.aerosuite_fixed_expense_payments from public,anon,authenticated;
create table if not exists public.aerosuite_petty_cash_day_checks(
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 expense_day date not null,
 expense_count integer not null check(expense_count>=0),
 total_ars numeric(16,2) not null default 0,
 total_usd numeric(16,2) not null default 0,
 checked_by uuid not null references auth.users(id),
 checked_at timestamptz not null default now(),
 primary key(institution_id,expense_day)
);
alter table public.aerosuite_petty_cash_day_checks enable row level security;
revoke all on public.aerosuite_petty_cash_day_checks from public,anon,authenticated;
CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_fixed_expense_access(p_inst uuid, p_write boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_mode text;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_inst and m.user_id=v_actor and m.role in ('administrador','secretaria');
 if v_actor is null or v_mode is null or v_mode='blocked' or (p_write and v_mode not in('trial','grace','active')) then
  raise exception 'Acceso no autorizado al control económico de esta institución.' using errcode='42501';
 end if;
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_fixed_expense_create(p_inst uuid, p_description text, p_category text, p_amount numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 perform aerosuite_internal.aerosuite_fixed_expense_access(p_inst,true);
 if length(btrim(coalesce(p_description,''))) not between 3 and 250
    or length(btrim(coalesce(p_category,''))) not between 2 and 90
    or p_amount is null or p_amount<=0 or p_amount>1000000000000
    or round(p_amount,2)<>p_amount or p_currency not in('ARS','USD') then
  raise exception 'Completá concepto, categoría, importe y moneda válidos.' using errcode='22023';
 end if;
 insert into public.aerosuite_fixed_expense_rules(institution_id,description,category,amount,currency,created_by)
 values(p_inst,btrim(p_description),btrim(p_category),p_amount,p_currency,auth.uid())
 returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id);
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_fixed_expense_deactivate(p_inst uuid, p_rule uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform aerosuite_internal.aerosuite_fixed_expense_access(p_inst,true);
 update public.aerosuite_fixed_expense_rules set active=false where id=p_rule and institution_id=p_inst and active;
 if not found then raise exception 'Gasto fijo no encontrado o ya desactivado.' using errcode='P0002';end if;
 return jsonb_build_object('ok',true);
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_fixed_expense_overview(p_inst uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_month date;v_items jsonb;
begin
 perform aerosuite_internal.aerosuite_fixed_expense_access(p_inst,false);
 if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
  raise exception 'Mes inválido (AAAA-MM).' using errcode='22023';
 end if;
 v_month:=to_date(p_month||'-01','YYYY-MM-DD');
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'description',r.description,'category',r.category,
  'amount',r.amount,'currency',r.currency,'active',r.active,
  'paid',pay.id is not null,'paid_at',pay.recorded_at)
  order by r.description),'[]'::jsonb) into v_items
 from public.aerosuite_fixed_expense_rules r
 left join public.aerosuite_fixed_expense_payments pay on pay.rule_id=r.id and pay.expense_month=v_month
 where r.institution_id=p_inst and r.active;
 return jsonb_build_object('month',p_month,'rules',v_items);
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_fixed_expense_pay(p_inst uuid, p_rule uuid, p_month text, p_method text, p_payment_reference text, p_fiscal_reference text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rule public.aerosuite_fixed_expense_rules%rowtype;v_month date;v_existing uuid;v_res jsonb;v_movement uuid;
begin
 perform aerosuite_internal.aerosuite_fixed_expense_access(p_inst,true);
 if p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_method not in('cash','bank_transfer')
  or p_request_id is null or length(coalesce(p_payment_reference,''))>120
  or length(coalesce(p_fiscal_reference,''))>120
  or (p_method='bank_transfer' and length(btrim(coalesce(p_payment_reference,'')))<4) then
  raise exception 'Mes, medio de pago o referencia incorrectos.' using errcode='22023';
 end if;
 v_month:=to_date(p_month||'-01','YYYY-MM-DD');
 if v_month>date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date then
  raise exception 'No se puede registrar un mes futuro como pagado.' using errcode='22023';
 end if;
 select * into v_rule from public.aerosuite_fixed_expense_rules
 where id=p_rule and institution_id=p_inst and active for update;
 if not found then raise exception 'El gasto fijo no existe o está desactivado.' using errcode='P0002';end if;
 select movement_id into v_existing from public.aerosuite_fixed_expense_payments
 where rule_id=p_rule and expense_month=v_month;
 if found then return jsonb_build_object('ok',true,'already_registered',true,'movement_id',v_existing);end if;
 v_res:=aerosuite_internal.aerosuite_record_school_expense(
  p_inst,'expense',v_rule.amount,v_rule.currency,v_rule.category,
  left('Gasto fijo '||p_month||': '||v_rule.description,500),
  p_method,coalesce(p_payment_reference,''),coalesce(p_fiscal_reference,''),p_request_id);
 v_movement:=(v_res->>'movement_id')::uuid;
 if v_movement is null then raise exception 'No se pudo vincular el pago fijo.';end if;
 insert into public.aerosuite_fixed_expense_payments(institution_id,rule_id,expense_month,movement_id,recorded_by)
 values(p_inst,p_rule,v_month,v_movement,auth.uid());
 return jsonb_build_object('ok',true,'already_registered',false,'movement_id',v_movement,'month',p_month);
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_petty_day_review(p_inst uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;v_ars numeric;v_usd numeric;
begin
 perform aerosuite_internal.aerosuite_fixed_expense_access(p_inst,true);
 if p_day is null or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date or p_day<current_date-365 then
  raise exception 'Fecha de caja chica fuera de rango.' using errcode='22023';
 end if;
 select count(*),coalesce(sum(amount) filter(where currency='ARS'),0),coalesce(sum(amount) filter(where currency='USD'),0)
 into v_count,v_ars,v_usd
 from public.aerosuite_money_movements m
 where m.institution_id=p_inst and m.movement_type='petty_expense'
 and (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date=p_day;
 insert into public.aerosuite_petty_cash_day_checks(institution_id,expense_day,expense_count,total_ars,total_usd,checked_by,checked_at)
 values(p_inst,p_day,v_count,v_ars,v_usd,auth.uid(),now())
 on conflict(institution_id,expense_day) do update set
 expense_count=excluded.expense_count,total_ars=excluded.total_ars,total_usd=excluded.total_usd,
 checked_by=excluded.checked_by,checked_at=now();
 return jsonb_build_object('ok',true,'day',p_day,'count',v_count,'ars',v_ars,'usd',v_usd);
end $function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_petty_day_status(p_inst uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;v_ars numeric;v_usd numeric;v_check public.aerosuite_petty_cash_day_checks%rowtype;
begin
 perform aerosuite_internal.aerosuite_fixed_expense_access(p_inst,false);
 if p_day is null or p_day> (now() at time zone 'America/Argentina/Buenos_Aires')::date or p_day<current_date-365 then
  raise exception 'Fecha de caja chica fuera de rango.' using errcode='22023';
 end if;
 select count(*),coalesce(sum(amount) filter(where currency='ARS'),0),coalesce(sum(amount) filter(where currency='USD'),0)
 into v_count,v_ars,v_usd
 from public.aerosuite_money_movements m
 where m.institution_id=p_inst and m.movement_type='petty_expense'
 and (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date=p_day;
 select * into v_check from public.aerosuite_petty_cash_day_checks where institution_id=p_inst and expense_day=p_day;
 return jsonb_build_object('day',p_day,'count',v_count,'ars',v_ars,'usd',v_usd,
   'reviewed',v_check.checked_at is not null and v_check.expense_count=v_count
     and v_check.total_ars=v_ars and v_check.total_usd=v_usd,
   'checked_at',v_check.checked_at,'checked_by',v_check.checked_by);
end $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_fixed_expense_create(p_inst uuid, p_description text, p_category text, p_amount numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_fixed_expense_create(p_inst,p_description,p_category,p_amount,p_currency) $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_fixed_expense_deactivate(p_inst uuid, p_rule uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_fixed_expense_deactivate(p_inst,p_rule) $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_fixed_expense_overview(p_inst uuid, p_month text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_fixed_expense_overview(p_inst,p_month) $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_fixed_expense_pay(p_inst uuid, p_rule uuid, p_month text, p_method text, p_payment_reference text, p_fiscal_reference text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_fixed_expense_pay(p_inst,p_rule,p_month,p_method,p_payment_reference,p_fiscal_reference,p_request_id) $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_petty_day_review(p_inst uuid, p_day date)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_petty_day_review(p_inst,p_day) $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_petty_day_status(p_inst uuid, p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select aerosuite_internal.aerosuite_petty_day_status(p_inst,p_day) $function$
;
revoke all on function public.aerosuite_fixed_expense_overview(uuid,text),
 public.aerosuite_fixed_expense_create(uuid,text,text,numeric,text),
 public.aerosuite_fixed_expense_deactivate(uuid,uuid),
 public.aerosuite_fixed_expense_pay(uuid,uuid,text,text,text,text,uuid),
 public.aerosuite_petty_day_status(uuid,date),public.aerosuite_petty_day_review(uuid,date)
 from public,anon;
grant execute on function public.aerosuite_fixed_expense_overview(uuid,text),
 public.aerosuite_fixed_expense_create(uuid,text,text,numeric,text),
 public.aerosuite_fixed_expense_deactivate(uuid,uuid),
 public.aerosuite_fixed_expense_pay(uuid,uuid,text,text,text,text,uuid),
 public.aerosuite_petty_day_status(uuid,date),public.aerosuite_petty_day_review(uuid,date)
 to authenticated;
