-- Una prueba AeroSuite dura 30 días según trial_ends_at.
-- Al finalizar pasa DIRECTAMENTE a solo lectura, sin días adicionales de escritura.
-- Se preservan los documentos y acceso de consulta, pero se bloquean acciones de cambio.
CREATE OR REPLACE FUNCTION private.aerosuite_access_mode(p_status text, p_trial_ends_at timestamp with time zone, p_license_ends_at timestamp with time zone, p_as_of timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select case
  when p_status='trial' and p_trial_ends_at>p_as_of then 'trial'
  when p_status='trial' and p_trial_ends_at is not null then 'read_only'
  when p_status='active' and p_license_ends_at>p_as_of then 'active'
  when p_status='active' and p_license_ends_at is not null then 'read_only'
  else 'blocked'
 end;
$function$;

-- Quitar una fecha de gracia que ya no existe del resumen de acceso del portal.
CREATE OR REPLACE FUNCTION public.aerosuite_my_institution_access_v2()
 RETURNS TABLE(institution_id uuid, institution_name text, institution_kind text, plan text, license_status text, my_role text, expires_at timestamp with time zone, can_access boolean, can_write boolean, access_mode text, grace_ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select
 org.id,org.name,org.kind,
 case when m.role in ('administrador','secretaria') then org.plan else null::text end,
 case when m.role in ('administrador','secretaria') then org.status else null::text end,
 m.role,
 case when m.role in ('administrador','secretaria') then
   case when org.status='trial' then org.trial_ends_at else org.license_ends_at end
   else null::timestamptz end,
 ent.mode<>'blocked',
 ent.mode in ('trial','active'),
 case when m.role in ('administrador','secretaria') then ent.mode
      when ent.mode in ('trial','active') then 'active'
      else ent.mode end,
 null::timestamptz
 from public.aerosuite_institution_members m
 join public.aerosuite_institutions org on org.id=m.institution_id
 cross join lateral (select private.aerosuite_access_mode(
   org.status,org.trial_ends_at,org.license_ends_at,now()
 ) as mode) ent
 where m.user_id=(select auth.uid())
 order by org.name,m.role;
$function$;
