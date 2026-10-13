create table if not exists public.gdv_home_brand_position (
 id smallint primary key check (id=1),
 shift_x_pct numeric(6,2) not null default 0 check (shift_x_pct between -80 and 80),
 shift_y_pct numeric(6,2) not null default 0 check (shift_y_pct between -80 and 80),
 updated_at timestamptz not null default now()
);
alter table public.gdv_home_brand_position enable row level security;
drop policy if exists "Marca portada lectura" on public.gdv_home_brand_position;
create policy "Marca portada lectura" on public.gdv_home_brand_position
 for select to anon,authenticated using (true);
drop policy if exists "Marca portada edicion admin" on public.gdv_home_brand_position;
create policy "Marca portada edicion admin" on public.gdv_home_brand_position
 for all to authenticated
 using (exists (select 1 from public.site_admins where user_id=(select auth.uid())))
 with check (exists (select 1 from public.site_admins where user_id=(select auth.uid())));
grant select on public.gdv_home_brand_position to anon;
grant select,insert,update,delete on public.gdv_home_brand_position to authenticated;