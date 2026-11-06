-- RLS explícitamente cerrado para las cinco tablas internas del laboratorio gratuito.
-- No otorga permisos ni expone datos ficticios a la API.
create policy "sin_lectura_api" on aerosuite_lab.aircraft for select to anon,authenticated using(false);
create policy "sin_lectura_api" on aerosuite_lab.reports for select to anon,authenticated using(false);
create policy "sin_lectura_api" on aerosuite_lab.packs for select to anon,authenticated using(false);
create policy "sin_lectura_api" on aerosuite_lab.pack_usages for select to anon,authenticated using(false);
create policy "sin_lectura_api" on aerosuite_lab.checkouts for select to anon,authenticated using(false);
