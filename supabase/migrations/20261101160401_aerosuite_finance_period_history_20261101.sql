-- AeroSuite: resumen económico histórico por mes o año, sin modificar movimientos existentes.
-- Todas las fechas se agrupan en horario de Buenos Aires. Las monedas no se convierten.
create or replace function public.aerosuite_finance_period_summary(
 p_institution_id uuid, p_kind text, p_period text
) returns jsonb
language plpgsql stable security definer set search_path=''
as $fn$
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
   coalesce(sum(amount) filter(where movement_type in('pack_sale','hour_payment')),0) income,
   coalesce(sum(amount) filter(where movement_type in('expense','petty_expense','refund')),0) expenses,
   coalesce(sum(amount) filter(where movement_type in('pack_sale','hour_payment') and payment_method='cash'),0) cash_in,
   coalesce(sum(amount) filter(where movement_type in('pack_sale','hour_payment') and payment_method='bank_transfer'),0) bank_in,
   coalesce(sum(amount) filter(where movement_type in('pack_sale','hour_payment') and (payment_method not in('cash','bank_transfer') or payment_method is null)),0) unspecified_in
  from public.aerosuite_money_movements
  where institution_id=p_institution_id and created_at>=v_from and created_at<v_until
  group by currency
 ) x;
 select count(*) into v_movements from public.aerosuite_money_movements
 where institution_id=p_institution_id and created_at>=v_from and created_at<v_until;

 with monthly as (
  select date_trunc('month',created_at at time zone 'America/Argentina/Buenos_Aires')::date as month_date,
   currency,count(*) as cnt,
   coalesce(sum(amount) filter(where movement_type in('pack_sale','hour_payment')),0) as income,
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
$fn$;
revoke all on function public.aerosuite_finance_period_summary(uuid,text,text) from public,anon;
grant execute on function public.aerosuite_finance_period_summary(uuid,text,text) to authenticated;