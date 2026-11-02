-- Registro de Piloto PPA/Comercial: una identidad Auth y ficha personal reutilizada.
-- Los datos declarados por el usuario no equivalen a autorización operacional.
alter table public.aerosuite_flight_bookings
 add column if not exists with_instructor boolean not null default true;
alter table public.aerosuite_availability_slots
 add column if not exists retired_at timestamptz;

create table if not exists public.aerosuite_pilot_authorizations (
 institution_id uuid not null references public.aerosuite_institutions(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'verified' check(status in ('verified','revoked')),
 verification_reference text not null check(length(btrim(verification_reference)) between 8 and 250),
 verified_by uuid not null references auth.users(id) on delete restrict,
 verified_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(institution_id,user_id)
);
alter table public.aerosuite_pilot_authorizations enable row level security;
revoke all on public.aerosuite_pilot_authorizations from public,anon,authenticated;
comment on table public.aerosuite_pilot_authorizations is
 'Verificación de condición aeronáutica por Secretaría/Dirección, no declaración autónoma de licencia.';
