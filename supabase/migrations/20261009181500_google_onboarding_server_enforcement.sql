-- Keep Google registration rules consistent across web and mobile sessions.
CREATE OR REPLACE FUNCTION gdv_private.can_participate()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
        and p.onboarding_completed = true
        and not exists (
          select 1 from public.gdv_members m
          where m.user_id = u.id and m.suspended_until > now()
        )
        and (
          not (
            u.raw_app_meta_data->>'provider' = 'google'
            or exists (
              select 1 from auth.identities i
              where i.user_id = u.id and i.provider = 'google'
            )
          )
          or (
            nullif(btrim(p.full_name),'') is not null
            and length(btrim(p.full_name)) >= 2
            and nullif(btrim(p.aviation_role),'') is not null
            and length(btrim(p.aviation_role)) >= 3
            and p.username is not null
            and p.username !~* '^piloto_[0-9a-f]{12}$'
          )
        )
    );
$function$

CREATE OR REPLACE FUNCTION gdv_private.validate_google_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.onboarding_completed = false and new.onboarding_completed = true then
    if char_length(btrim(coalesce(new.username,''))) < 3
      or new.username ~* '^piloto_[0-9a-f]{12}$'
      or char_length(btrim(coalesce(new.full_name,''))) < 2
      or char_length(btrim(coalesce(new.aviation_role,''))) < 3 then
      raise exception 'Completá nombre visible, nombre de usuario y actividad aeronáutica antes de participar';
    end if;
  end if;
  return new;
end;
$function$

-- Previously authenticated Google users without required profile information must complete onboarding.
UPDATE public.profiles AS p
SET onboarding_completed = false
FROM auth.users AS u
WHERE u.id = p.id
  AND p.onboarding_completed = true
  AND (
    u.raw_app_meta_data->>'provider' = 'google'
    OR EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=p.id AND i.provider='google')
  )
  AND (
    length(btrim(coalesce(p.full_name,''))) < 2
    OR length(btrim(coalesce(p.aviation_role,''))) < 3
    OR p.username ~* '^piloto_[0-9a-f]{12}$'
  );
