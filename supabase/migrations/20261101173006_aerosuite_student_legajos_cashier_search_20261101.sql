-- AeroSuite: legajo interno y búsqueda institucional de alumnos para cobros.
-- No modificar DNI, pagos ni saldos de packs.
create sequence if not exists public.aerosuite_member_legajo_seq as bigint start with 1 increment by 1;
alter table public.aerosuite_institution_members
 add column if not exists legajo_number bigint;
alter table public.aerosuite_institution_members
 alter column legajo_number set default nextval('public.aerosuite_member_legajo_seq'::regclass);
-- Asegura que una secuencia preexistente nunca replique números existentes.
select setval('public.aerosuite_member_legajo_seq'::regclass,
 greatest((select coalesce(max(legajo_number),0) from public.aerosuite_institution_members), 1),
 (select count(*)>0 from public.aerosuite_institution_members where legajo_number is not null));
update public.aerosuite_institution_members
 set legajo_number=nextval('public.aerosuite_member_legajo_seq'::regclass)
 where legajo_number is null;
create unique index if not exists aerosuite_institution_members_legajo_unique
 on public.aerosuite_institution_members(legajo_number);

create or replace function public.aerosuite_cashier_student_search(
 p_institution_id uuid,p_search text
) returns jsonb
language plpgsql stable security definer set search_path=''
as $fn$
declare
 v_actor uuid:=auth.uid();
 v_mode text;
 v_term text:=left(btrim(coalesce(p_search,'')),90);
 v_digits text:=regexp_replace(v_term,'[^0-9]','','g');
 v_results jsonb;
begin
 select private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 into v_mode
 from public.aerosuite_institutions i
 join public.aerosuite_institution_members m on m.institution_id=i.id
 where i.id=p_institution_id and m.user_id=v_actor and m.role in('administrador','secretaria')
 limit 1;
 if v_actor is null or v_mode is null or v_mode='blocked' then
  raise exception 'Solo Dirección y Secretaría pueden buscar alumnos de esta escuela.' using errcode='42501';
 end if;
 if length(v_term)<2 then return '[]'::jsonb;end if;
 with students as (
  select m.user_id as student_id,
   u.email::text as email,
   coalesce(nullif(btrim(concat_ws(' ',mp.given_names,mp.family_names)), ''),
            nullif(btrim(p.full_name),''),
            nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
            u.email)::text as full_name,
   ('AL-'||lpad(m.legajo_number::text,6,'0'))::text as legajo,
   m.legajo_number
  from public.aerosuite_institution_members m
  join auth.users u on u.id=m.user_id
  left join public.aerosuite_member_profiles mp on mp.user_id=m.user_id
  left join public.profiles p on p.id=m.user_id
  where m.institution_id=p_institution_id and m.role='alumno'
 ),
 matches as (
  select *
  from students s
  where position(lower(v_term) in lower(s.full_name))>0
   or position(lower(v_term) in lower(s.email))>0
   or position(lower(v_term) in lower(s.legajo))>0
   or (v_term~'^[0-9]+$' and s.legajo_number::text=v_term)
   or (length(v_digits) between 7 and 12 and exists(
     select 1 from public.aerosuite_member_documents d
     where d.user_id=s.student_id and d.document_type='dni'
       and regexp_replace(d.document_number,'[^0-9]','','g')=v_digits
   ))
  order by s.full_name,s.legajo limit 20
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'student_id',student_id,'full_name',full_name,'email',email,'legajo',legajo
  ) order by full_name,legajo),'[]'::jsonb) into v_results from matches;
 return v_results;
end;
$fn$;
revoke all on function public.aerosuite_cashier_student_search(uuid,text) from public,anon;
grant execute on function public.aerosuite_cashier_student_search(uuid,text) to authenticated;
