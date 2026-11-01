-- Pack voids are corrections with audit, not silent deletion.
alter table public.aerosuite_hour_packs
 add column if not exists voided_at timestamptz,
 add column if not exists voided_by uuid references auth.users(id),
 add column if not exists voided_reason text,
 add column if not exists void_kind text check(void_kind in('correction','refund'));
alter table public.aerosuite_money_movements drop constraint if exists aerosuite_money_movements_movement_type_check;
alter table public.aerosuite_money_movements add constraint aerosuite_money_movements_movement_type_check
 check(movement_type in ('hour_payment','pack_sale','pack_reversal','expense','petty_expense','refund'));
create table if not exists public.aerosuite_pack_void_audit(
 id bigint generated always as identity primary key,
 institution_id uuid not null references public.aerosuite_institutions(id) on delete cascade,
 pack_id uuid not null unique references public.aerosuite_hour_packs(id) on delete restrict,
 student_id uuid not null references auth.users(id),
 actor_id uuid not null references auth.users(id),
 reason text not null,
 kind text not null check(kind in('correction','refund')),
 original_movement_id uuid references public.aerosuite_money_movements(id),
 compensating_movement_id uuid references public.aerosuite_money_movements(id),
 created_at timestamptz not null default now()
);
alter table public.aerosuite_pack_void_audit enable row level security;
revoke all on public.aerosuite_pack_void_audit from public,anon,authenticated;
create or replace function aerosuite_internal.aerosuite_guard_void_pack_usage()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if exists(select 1 from public.aerosuite_hour_packs p where p.id=new.pack_id and p.voided_at is not null) then
  raise exception 'Este pack fue anulado y no puede descontarse.' using errcode='23514';
 end if;
 return new;
end $fn$;
drop trigger if exists aerosuite_no_void_pack_usage on public.aerosuite_pack_usages;
create trigger aerosuite_no_void_pack_usage before insert or update of pack_id on public.aerosuite_pack_usages
for each row execute function aerosuite_internal.aerosuite_guard_void_pack_usage();

create or replace function public.aerosuite_void_hour_pack(
 p_institution_id uuid,p_pack_id uuid,p_reason text,
 p_kind text default 'correction',p_refund_method text default null,p_refund_reference text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_actor uuid:=auth.uid();v_mode text;v_pack public.aerosuite_hour_packs%rowtype;
 v_sale public.aerosuite_money_movements%rowtype;v_comp uuid;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_payment text;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode not in('trial','active','grace') then
  raise exception 'Solo Secretaría y Dirección pueden anular packs.' using errcode='42501';end if;
 if length(v_reason)<5 or length(v_reason)>300 or p_kind not in ('correction','refund') then
  raise exception 'Elegí el tipo de anulación y un motivo de 5 a 300 caracteres.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,0));
 select * into v_pack from public.aerosuite_hour_packs
  where id=p_pack_id and institution_id=p_institution_id for update;
 if not found or v_pack.voided_at is not null then raise exception 'Pack inexistente o previamente anulado.' using errcode='22023';end if;
 if exists(select 1 from public.aerosuite_pack_usages u where u.pack_id=v_pack.id) then
  raise exception 'El pack ya tiene horas consumidas. Regularizá los vuelos antes de anularlo.' using errcode='22023';
 end if;
 select * into v_sale from public.aerosuite_money_movements m
  where m.pack_id=v_pack.id and m.institution_id=p_institution_id and m.movement_type='pack_sale'
  order by m.created_at for update;
 if v_pack.paid_amount>0 and v_sale.id is null then
  raise exception 'No se encontró el cobro original. Revisá la contaduría antes de anular.' using errcode='22023';
 end if;
 if p_kind='refund' and (p_refund_method not in('cash','bank_transfer') or
   (p_refund_method='bank_transfer' and length(btrim(coalesce(p_refund_reference,'')))<4)) then
  raise exception 'Indicá cómo y con qué referencia se devolvió realmente el dinero.' using errcode='22023';
 end if;
 v_payment:=case when p_kind='refund' then p_refund_method else coalesce(v_sale.payment_method,'not_recorded') end;
 update public.aerosuite_hour_packs set voided_at=now(),voided_by=v_actor,
  voided_reason=v_reason,void_kind=p_kind where id=v_pack.id;
 if v_pack.paid_amount>0 then
  insert into public.aerosuite_money_movements(
   institution_id,student_id,pack_id,movement_type,amount,currency,description,created_by,payment_method,payment_reference)
  values(p_institution_id,v_pack.student_id,v_pack.id,
   case when p_kind='correction' then 'pack_reversal' else 'refund' end,
   v_pack.paid_amount,v_pack.currency,
   left((case when p_kind='correction' then 'Corrección de compra de pack registrada por error: ' else 'Devolución efectiva por anulación de pack: ' end)||v_reason,500),
   v_actor,v_payment,case when p_kind='refund' then left(btrim(coalesce(p_refund_reference,'')),120) else '' end)
  returning id into v_comp;
 end if;
 insert into public.aerosuite_pack_void_audit(
  institution_id,pack_id,student_id,actor_id,reason,kind,original_movement_id,compensating_movement_id)
 values(p_institution_id,v_pack.id,v_pack.student_id,v_actor,v_reason,p_kind,v_sale.id,v_comp);
 return jsonb_build_object('ok',true,'pack_id',v_pack.id,'mode',p_kind,'compensating_movement_id',v_comp);
end $fn$;
revoke all on function public.aerosuite_void_hour_pack(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.aerosuite_void_hour_pack(uuid,uuid,text,text,text,text) to authenticated;

create or replace function public.aerosuite_voided_hour_packs_list(p_institution_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_actor uuid:=auth.uid();v_mode text;v_result jsonb;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now()) into v_mode
 from public.aerosuite_institution_members m join public.aerosuite_institutions i on i.id=m.institution_id
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria') limit 1;
 if v_actor is null or v_mode='blocked' or v_mode is null then raise exception 'No autorizado.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'pack_id',p.id,'student_email',u.email,'minutes',p.total_minutes,'amount',p.paid_amount,
  'currency',p.currency,'voided_at',p.voided_at,'reason',p.voided_reason,'kind',p.void_kind
 ) order by p.voided_at desc),'[]'::jsonb) into v_result
 from public.aerosuite_hour_packs p left join auth.users u on u.id=p.student_id
 where p.institution_id=p_institution_id and p.voided_at is not null;
 return v_result;
end $fn$;
revoke all on function public.aerosuite_voided_hour_packs_list(uuid) from public,anon;
grant execute on function public.aerosuite_voided_hour_packs_list(uuid) to authenticated;

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
 where m.institution_id=p_institution_id and m.user_id=v_actor and m.role in ('administrador','secretaria','alumno') limit 1;
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
end;$function$
;

CREATE OR REPLACE FUNCTION aerosuite_internal.aerosuite_finance_overview(p_institution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();v_role text;v_mode text;
 v_start timestamptz;v_end timestamptz;v_summary jsonb;v_categories jsonb;
 v_pack_count integer;v_pack_minutes bigint;v_pack_used bigint;
 v_unsettled integer;v_month_count integer;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor AND m.role IN('administrador','secretaria');
 IF v_actor IS NULL OR v_role IS NULL OR v_mode='blocked' THEN
  RAISE EXCEPTION 'Solo Secretaría o Dirección pueden consultar el estado económico.' USING errcode='42501';
 END IF;
 v_start:=date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires';
 v_end:=(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')+interval '1 month') AT TIME ZONE 'America/Argentina/Buenos_Aires';
 SELECT coalesce(jsonb_object_agg(currency,jsonb_build_object(
  'income',income,'expenses',expenses,'net',income-expenses,
  'cash_in',cash_in,'bank_in',bank_in,'unspecified_in',unspecified_in,
  'cash_out',cash_out,'bank_out',bank_out,'unspecified_out',unspecified_out
 )),'{}'::jsonb)
 INTO v_summary FROM (
  SELECT currency,
   sum(CASE WHEN movement_type IN ('pack_sale','hour_payment') THEN amount WHEN movement_type='pack_reversal' THEN -amount ELSE 0 END) income,
   sum(CASE WHEN movement_type IN ('expense','petty_expense','refund') THEN amount ELSE 0 END) expenses,
   sum(CASE WHEN movement_type IN ('pack_sale','hour_payment') AND payment_method='cash' THEN amount WHEN movement_type='pack_reversal' AND payment_method='cash' THEN -amount ELSE 0 END) cash_in,
   sum(CASE WHEN movement_type IN ('pack_sale','hour_payment') AND payment_method='bank_transfer' THEN amount WHEN movement_type='pack_reversal' AND payment_method='bank_transfer' THEN -amount ELSE 0 END) bank_in,
   sum(CASE WHEN movement_type IN ('pack_sale','hour_payment') AND payment_method='not_recorded' THEN amount WHEN movement_type='pack_reversal' AND payment_method='not_recorded' THEN -amount ELSE 0 END) unspecified_in,
   sum(CASE WHEN movement_type IN ('expense','petty_expense','refund') AND payment_method='cash' THEN amount ELSE 0 END) cash_out,
   sum(CASE WHEN movement_type IN ('expense','petty_expense','refund') AND payment_method='bank_transfer' THEN amount ELSE 0 END) bank_out,
   sum(CASE WHEN movement_type IN ('expense','petty_expense','refund') AND payment_method='not_recorded' THEN amount ELSE 0 END) unspecified_out
  FROM public.aerosuite_money_movements
  WHERE institution_id=p_institution_id AND created_at>=v_start AND created_at<v_end
  GROUP BY currency
 ) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('category',category,'currency',currency,'amount',amount)
  ORDER BY amount DESC),'[]'::jsonb)
 INTO v_categories
 FROM (
  SELECT coalesce(NULLIF(expense_category,''),'Sin clasificar') category,currency,sum(amount) amount
  FROM public.aerosuite_money_movements
  WHERE institution_id=p_institution_id AND created_at>=v_start AND created_at<v_end
  AND movement_type IN('expense','petty_expense','refund')
  GROUP BY 1,2
 ) x;
 SELECT count(*),coalesce(sum(total_minutes),0),coalesce(sum(used_minutes),0)
 INTO v_pack_count,v_pack_minutes,v_pack_used
 FROM (
  SELECT p.id,p.total_minutes,coalesce(sum(u.minutes),0) used_minutes
  FROM public.aerosuite_hour_packs p LEFT JOIN public.aerosuite_pack_usages u ON u.pack_id=p.id AND u.institution_id=p.institution_id
  WHERE p.institution_id=p_institution_id AND p.voided_at IS NULL
  GROUP BY p.id
 ) x;
 SELECT count(*) INTO v_unsettled
 FROM public.aerosuite_flight_bookings b JOIN public.aerosuite_flight_reports r
 ON r.booking_id=b.id AND r.institution_id=b.institution_id AND r.status='approved'
 WHERE b.institution_id=p_institution_id AND b.status='completed'
 AND NOT EXISTS(SELECT 1 FROM public.aerosuite_money_movements m WHERE m.booking_id=b.id AND m.movement_type='hour_payment')
 AND NOT EXISTS(SELECT 1 FROM public.aerosuite_pack_usages u WHERE u.booking_id=b.id);
 SELECT count(*) INTO v_month_count FROM public.aerosuite_money_movements
 WHERE institution_id=p_institution_id AND created_at>=v_start AND created_at<v_end;
 RETURN jsonb_build_object(
  'month',to_char(v_start AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM'),
  'from',v_start,'to_exclusive',v_end,'as_of',now(),
  'currencies',v_summary,'expense_categories',v_categories,
  'total_movements',v_month_count,'active_pack_count',v_pack_count,
  'pack_minutes_purchased',v_pack_minutes,'pack_minutes_used',v_pack_used,
  'pack_minutes_available',v_pack_minutes-v_pack_used,
  'approved_flights_not_settled',v_unsettled,
  'caveat','Los importes son flujo del mes registrado en AeroSuite; NO son saldos bancarios conciliados ni resultado contable devengado.'
 );
END $function$
;

CREATE OR REPLACE FUNCTION public.aerosuite_finance_period_summary(p_institution_id uuid, p_kind text, p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_role text;
 v_year integer;
 v_month integer;
 v_start_date date;
 v_end_date date;
 v_year_start date;
 v_from timestamptz;
 v_until timestamptz;
 v_year_from timestamptz;
 v_year_until timestamptz;
 v_currencies jsonb;
 v_history jsonb;
 v_movements bigint;
begin
 select m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_role,v_mode
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions i on i.id=m.institution_id
 where i.id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria')
 limit 1;
 if v_actor is null or v_role is null or v_mode='blocked' then
  raise exception 'Solo Dirección y Secretaría pueden consultar la información económica.' using errcode='42501';
 end if;
 if p_kind not in ('month','year') or p_period is null then
  raise exception 'Elegí mes o año válido.' using errcode='22023';
 end if;
 if (p_kind='month' and p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
 or (p_kind='year' and p_period !~ '^[0-9]{4}$') then
  raise exception 'Período inválido.' using errcode='22023';
 end if;
 v_year:=left(p_period,4)::integer;
 if v_year not between 2020 and 2099 then
  raise exception 'El año está fuera del rango de consulta.' using errcode='22023';
 end if;
 v_month:=case when p_kind='month' then right(p_period,2)::integer else 1 end;
 v_start_date:=make_date(v_year,v_month,1);
 v_end_date:=(v_start_date+(case when p_kind='month' then interval '1 month' else interval '1 year' end))::date;
 v_year_start:=make_date(v_year,1,1);
 v_from:=v_start_date::timestamp at time zone 'America/Argentina/Buenos_Aires';
 v_until:=v_end_date::timestamp at time zone 'America/Argentina/Buenos_Aires';
 v_year_from:=v_year_start::timestamp at time zone 'America/Argentina/Buenos_Aires';
 v_year_until:=(v_year_start+interval '1 year') at time zone 'America/Argentina/Buenos_Aires';

 select coalesce(jsonb_object_agg(currency,jsonb_build_object(
  'income',income,'expenses',expenses,'net',income-expenses,
  'cash_in',cash_in,'bank_in',bank_in,'unspecified_in',unspecified_in
 )),'{}'::jsonb) into v_currencies from (
  select currency,
   coalesce(sum(case when movement_type in('pack_sale','hour_payment') then amount when movement_type='pack_reversal' then -amount else 0 end),0) income,
   coalesce(sum(amount) filter(where movement_type in('expense','petty_expense','refund')),0) expenses,
   coalesce(sum(case when payment_method='cash' and movement_type in('pack_sale','hour_payment') then amount when payment_method='cash' and movement_type='pack_reversal' then -amount else 0 end),0) cash_in,
   coalesce(sum(case when payment_method='bank_transfer' and movement_type in('pack_sale','hour_payment') then amount when payment_method='bank_transfer' and movement_type='pack_reversal' then -amount else 0 end),0) bank_in,
   coalesce(sum(case when (payment_method not in('cash','bank_transfer') or payment_method is null) and movement_type in('pack_sale','hour_payment') then amount when (payment_method not in('cash','bank_transfer') or payment_method is null) and movement_type='pack_reversal' then -amount else 0 end),0) unspecified_in
  from public.aerosuite_money_movements
  where institution_id=p_institution_id and created_at>=v_from and created_at<v_until
  group by currency
 ) x;
 select count(*) into v_movements from public.aerosuite_money_movements
 where institution_id=p_institution_id and created_at>=v_from and created_at<v_until;

 with monthly as (
  select date_trunc('month',created_at at time zone 'America/Argentina/Buenos_Aires')::date as month_date,
   currency,count(*) as cnt,
   coalesce(sum(case when movement_type in('pack_sale','hour_payment') then amount when movement_type='pack_reversal' then -amount else 0 end),0) as income,
   coalesce(sum(amount) filter(where movement_type in('expense','petty_expense','refund')),0) as expenses
  from public.aerosuite_money_movements
  where institution_id=p_institution_id and created_at>=v_year_from and created_at<v_year_until
  group by 1,2
 ), grouped as (
  select (v_year_start + (g.n||' months')::interval)::date as month_date,
   coalesce(sum(m.cnt),0) as movements,
   coalesce(sum(m.income) filter(where m.currency='ARS'),0) as ars_income,
   coalesce(sum(m.expenses) filter(where m.currency='ARS'),0) as ars_expenses,
   coalesce(sum(m.income) filter(where m.currency='USD'),0) as usd_income,
   coalesce(sum(m.expenses) filter(where m.currency='USD'),0) as usd_expenses
  from generate_series(0,11) g(n)
  left join monthly m on m.month_date=(v_year_start + (g.n||' months')::interval)::date
  group by g.n
 )
 select jsonb_agg(jsonb_build_object(
  'month',to_char(month_date,'YYYY-MM'),
  'total_movements',movements,
  'currencies',jsonb_build_object(
   'ARS',jsonb_build_object('income',ars_income,'expenses',ars_expenses,'net',ars_income-ars_expenses),
   'USD',jsonb_build_object('income',usd_income,'expenses',usd_expenses,'net',usd_income-usd_expenses)
  )
 ) order by month_date desc)
 into v_history from grouped;

 return jsonb_build_object(
  'kind',p_kind,'period',p_period,'year',v_year,
  'from',v_from,'to_exclusive',v_until,'as_of',now(),
  'currencies',v_currencies,'total_movements',v_movements,
  'history',coalesce(v_history,'[]'::jsonb),
  'caveat','Flujo de caja registrado, no balance contable, saldo bancario ni ganancia. Los packs se reconocen como ingreso cuando se cobran y su utilización no se contabiliza dos veces.'
 );
end;
$function$
;
