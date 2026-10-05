drop policy if exists "Administradores crean shimoda_publicaciones" on public.shimoda_publicaciones;
create policy "Administradores crean shimoda_publicaciones"
on public.shimoda_publicaciones
for insert
to authenticated
with check (
  exists (
    select 1
    from public.site_admins
    where site_admins.user_id = (select auth.uid())
  )
);
