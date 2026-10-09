-- Prevent an incomplete Google account from interacting with legacy tables,
-- even if someone loads the retired GitHub Pages entry point.
-- None of these policies delete users or existing content.
create policy "gdv_completed_registration_required_insert" on public."publicaciones" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."galeria" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."clasificados" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."gdv_chat_messages" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."travesias" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."actividades" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."forum_posts" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."forum_respuestas" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."shimoda_comentarios" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."aportes_destacados" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."aportes_adjuntos" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."gdv_contact" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_insert" on public."Licencias" as restrictive for insert to authenticated with check (gdv_private.can_participate());
create policy "gdv_completed_registration_required_chat_read" on public.gdv_chat_messages as restrictive for select to authenticated using (gdv_private.can_participate());
