-- Las cuentas de AeroSuite comparten Auth, pero no son integrantes de GDV automáticamente.
alter table public.profiles add column if not exists gdv_community_member boolean not null default false;
comment on column public.profiles.gdv_community_member is 'True for voluntary Gente de Vuelo community enrollment, independent of AeroSuite institution access.';

-- Perfiles comunitarios anteriores a la habilitación de usuarios institucionales.
update public.profiles set gdv_community_member=true
where not gdv_community_member and created_at < timestamptz '2026-10-26 00:00:00+00'
  and username ~ '^[A-Za-z0-9_-]{3,25}$' and username !~* '^piloto[_-][0-9a-f]{8,}$';

alter table public.profiles add constraint gdv_community_username_valid check (
  not gdv_community_member or (username ~ '^[A-Za-z0-9_-]{3,25}$'
   and username !~* '^piloto[_-][0-9a-f]{8,}$')
);

-- Auth técnico compartido, alta comunitaria independiente.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_username text := new.raw_user_meta_data ->> 'username';
begin
  insert into public.profiles
    (id, username, full_name, bio, onboarding_completed, gdv_community_member)
  values (
    new.id, v_username, new.raw_user_meta_data ->> 'full_name', '',
    coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google',
    (v_username ~ '^[A-Za-z0-9_-]{3,25}$' and v_username !~* '^piloto[_-][0-9a-f]{8,}$')
  );
  return new;
end;
$function$;

-- No revelar perfiles exclusivamente institucionales en el API público de comunidad.
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Community profiles public and personal profile private" on public.profiles
for select to public using (gdv_community_member is true or id = (select auth.uid()));

-- Ajustar funciones existentes conservando íntegro el formato y contenido de los correos.
do $patch$
declare v_def text;
begin
  select pg_get_functiondef('gdv_private.queue_completed_registration(uuid)'::regprocedure) into v_def;
  if position('AND p.onboarding_completed IS TRUE' in v_def)=0 then raise exception 'Estructura de registro inesperada'; end if;
  execute replace(v_def,'AND p.onboarding_completed IS TRUE','AND p.gdv_community_member IS TRUE' || chr(10) || '      AND p.onboarding_completed IS TRUE');

  select pg_get_functiondef('public.gdv_email_queue_signup_welcome()'::regprocedure) into v_def;
  if position('and (tg_op=''INSERT'' or old.email_confirmed_at is null) then' in v_def)=0 then raise exception 'Estructura de bienvenida inesperada'; end if;
  execute replace(v_def,'and (tg_op=''INSERT'' or old.email_confirmed_at is null) then',
    'and (tg_op=''INSERT'' or old.email_confirmed_at is null)' || chr(10) ||
    '    and (coalesce(new.raw_user_meta_data ->> ''gdv_community_signup'','''') = ''true''' || chr(10) ||
    '      or exists(select 1 from public.profiles p where p.id=new.id and p.gdv_community_member is true and p.onboarding_completed is true)) then');

  select pg_get_functiondef('public.gdv_admin_send_announcement(text,text)'::regprocedure) into v_def;
  if position('where u.email_confirmed_at is not null and u.deleted_at is null;' in v_def)=0 then raise exception 'Estructura de comunicados inesperada'; end if;
  execute replace(v_def,'where u.email_confirmed_at is not null and u.deleted_at is null;',
    'where u.email_confirmed_at is not null and u.deleted_at is null and p.gdv_community_member is true and p.onboarding_completed is true;');
end;
$patch$;

-- Para las altas por Google, bienvenida cuando efectivamente opta por GDV.
create or replace function gdv_private.gdv_community_google_welcome()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if new.gdv_community_member is true and new.onboarding_completed is true
    and (tg_op='INSERT' or old.gdv_community_member is distinct from true or old.onboarding_completed is distinct from true)
    and exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id and i.provider='google'
      where u.id=new.id and u.email_confirmed_at is not null and u.deleted_at is null)
    and not exists(select 1 from public.gdv_email_outbox q where q.kind='welcome' and q.user_id=new.id)
  then
    insert into public.gdv_email_outbox(kind,user_id,subject,body)
    values ('welcome',new.id,'¡Bienvenido a Gente de Vuelo!',
      '¡Bienvenido a bordo! Tu registro en Gente de Vuelo está completo. Ingresá a la comunidad: https://gentedevuelo.com/comunidad.html#foro');
  end if;
  return new;
end;
$function$;
drop trigger if exists gdv_community_google_welcome on public.profiles;
create trigger gdv_community_google_welcome
after insert or update of gdv_community_member,onboarding_completed on public.profiles
for each row execute function gdv_private.gdv_community_google_welcome();
