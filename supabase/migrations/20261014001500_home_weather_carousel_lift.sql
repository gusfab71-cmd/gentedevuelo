-- Ubicación vertical configurable del carrusel meteorológico de escritorio.
-- La versión móvil no usa este desplazamiento.
create table if not exists public.gdv_home_weather_position (
  id smallint primary key check (id = 1),
  lift_px smallint not null default 0 check (lift_px between 0 and 280),
  updated_at timestamptz not null default now()
);
alter table public.gdv_home_weather_position enable row level security;
drop policy if exists "Carrusel meteorologico lectura publica" on public.gdv_home_weather_position;
create policy "Carrusel meteorologico lectura publica" on public.gdv_home_weather_position
  for select to anon, authenticated using (true);
drop policy if exists "Carrusel meteorologico solo admin edita" on public.gdv_home_weather_position;
create policy "Carrusel meteorologico solo admin edita" on public.gdv_home_weather_position
  for all to authenticated
  using (exists (select 1 from public.site_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.site_admins where user_id = (select auth.uid())));
grant select on public.gdv_home_weather_position to anon;
grant select, insert, update, delete on public.gdv_home_weather_position to authenticated;
