
-- El usuario de AeroSuite puede no tener username de la comunidad.
-- En SQL, NULL ~ regex evalúa NULL; en una columna NOT NULL rompía Auth.generateLink.
-- Un registro institucional jamás se transforma automáticamente en miembro de Gente de Vuelo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
declare
 v_username text := new.raw_user_meta_data ->> 'username';
 v_joined_community boolean;
begin
 v_joined_community := coalesce(
   v_username ~ '^[A-Za-z0-9_-]{3,25}$'
   and v_username !~* '^piloto[_-][0-9a-f]{8,}$',
   false
 );
 insert into public.profiles
  (id,username,full_name,bio,onboarding_completed,gdv_community_member)
 values(
  new.id, v_username, new.raw_user_meta_data ->> 'full_name', '',
  coalesce(new.raw_app_meta_data ->> 'provider','') <> 'google',
  v_joined_community
 );
 return new;
end;
$function$;
