-- Control manual de la posición de la fotografía del avión en portada de escritorio.
-- Su lectura es pública; solo las cuentas en site_admins pueden guardar cambios.
-- La portada móvil mantiene las reglas anteriores.
create table if not exists public.gdv_home_aircraft_position (
  id smallint primary key check (id = 1),
  pos_x_pct numeric(5,2) not null default 50 check (pos_x_pct between 0 and 100),
  pos_y_pct numeric(5,2) not null default 65 check (pos_y_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
alter table public.gdv_home_aircraft_position enable row level security;
drop policy if exists "Avion portada lectura" on public.gdv_home_aircraft_position;
create policy "Avion portada lectura" on public.gdv_home_aircraft_position
  for select to anon, authenticated using (true);
drop policy if exists "Avion portada administracion" on public.gdv_home_aircraft_position;
create policy "Avion portada administracion" on public.gdv_home_aircraft_position
  for all to authenticated
  using (exists (select 1 from public.site_admins where user_id=(select auth.uid())))
  with check (exists (select 1 from public.site_admins where user_id=(select auth.uid())));
grant select on public.gdv_home_aircraft_position to anon;
grant select, insert, update, delete on public.gdv_home_aircraft_position to authenticated;
