-- AeroChat: suscripciones web push y llaves VAPID, octubre 2026.
-- Los endpoints push son credenciales de entrega: nunca accesibles mediante el cliente.
create table if not exists public.gdv_webpush_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  private_enabled boolean not null default true,
  general_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gdv_webpush_subscriptions_user_idx on public.gdv_webpush_subscriptions(user_id);
alter table public.gdv_webpush_subscriptions enable row level security;
revoke all on public.gdv_webpush_subscriptions from public, anon, authenticated;
grant all on public.gdv_webpush_subscriptions to service_role;

create table if not exists public.gdv_webpush_dispatches (
  kind text not null check (kind in ('private','general')),
  message_id bigint not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  dispatched_at timestamptz not null default now(),
  primary key (kind, message_id)
);
alter table public.gdv_webpush_dispatches enable row level security;
revoke all on public.gdv_webpush_dispatches from public, anon, authenticated;
grant all on public.gdv_webpush_dispatches to service_role;

create schema if not exists gdv_private;
create table if not exists gdv_private.gdv_webpush_vapid (
  singleton boolean primary key default true check (singleton),
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on schema gdv_private from public, anon, authenticated;
revoke all on gdv_private.gdv_webpush_vapid from public, anon, authenticated;
create or replace function public.gdv_webpush_vapid_key(p_key jsonb default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare result_key jsonb;
begin
  if p_key is not null then
    if p_key->>'kty' <> 'EC' or p_key->>'crv' <> 'P-256'
       or nullif(p_key->>'d','') is null
       or nullif(p_key->>'x','') is null
       or nullif(p_key->>'y','') is null then
      raise exception 'invalid vapid key';
    end if;
    insert into gdv_private.gdv_webpush_vapid(singleton, private_jwk)
      values (true, p_key)
      on conflict (singleton) do nothing;
  end if;
  select private_jwk into result_key
    from gdv_private.gdv_webpush_vapid where singleton = true;
  return result_key;
end;
$$;
revoke all on function public.gdv_webpush_vapid_key(jsonb) from public, anon, authenticated;
grant execute on function public.gdv_webpush_vapid_key(jsonb) to service_role;
comment on function public.gdv_webpush_vapid_key(jsonb) is
  'Privileged VAPID key bootstrap/read; invoke only with Supabase service_role';
