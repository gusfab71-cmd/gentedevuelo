-- Editor visual de portada: Robert Shimoda, Instituciones Amigas y CompraVenta.
-- Los cambios se aplican solo en PC; se conserva el diseño móvil existente.
create table if not exists public.gdv_home_card_layout (
  card_id text primary key check (card_id in ('shimoda','instituciones','compraventa')),
  pos_x_pct numeric(6,2) not null check (pos_x_pct between 0 and 100),
  pos_y_pct numeric(6,2) not null check (pos_y_pct between 0 and 100),
  width_px integer not null check (width_px between 100 and 900),
  height_px integer not null check (height_px between 48 and 600),
  updated_at timestamptz not null default now()
);
alter table public.gdv_home_card_layout enable row level security;
drop policy if exists "Tarjetas de portada visibles para todos" on public.gdv_home_card_layout;
create policy "Tarjetas de portada visibles para todos"
  on public.gdv_home_card_layout for select to anon,authenticated using (true);
drop policy if exists "Solo administradores editan tarjetas de portada" on public.gdv_home_card_layout;
create policy "Solo administradores editan tarjetas de portada"
  on public.gdv_home_card_layout for all to authenticated
  using (exists (select 1 from public.site_admins a where a.user_id=(select auth.uid())))
  with check (exists (select 1 from public.site_admins a where a.user_id=(select auth.uid())));
grant select on public.gdv_home_card_layout to anon;
grant select,insert,update,delete on public.gdv_home_card_layout to authenticated;
