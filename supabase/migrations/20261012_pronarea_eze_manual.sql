-- PRONAREA EZE: depósito manual y automático futuro. Ejecutar al aprobar la rama.
create table if not exists public.gdv_pronarea_bulletins (
 id bigint generated always as identity primary key,
 fir text not null default 'EZE' check (fir='EZE'),
 raw_text text not null check (char_length(raw_text) between 100 and 20000),
 source text not null default 'manual_smn' check (source in ('manual_smn','automatic_smn')),
 issued_at timestamptz not null,
 valid_until timestamptz not null,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 constraint pronarea_validity check (valid_until > issued_at and valid_until <= issued_at + interval '24 hours')
);
create index if not exists gdv_pronarea_bulletins_fir_issued on public.gdv_pronarea_bulletins (fir,issued_at desc);
alter table public.gdv_pronarea_bulletins enable row level security;
revoke all on public.gdv_pronarea_bulletins from anon;
grant select, insert on public.gdv_pronarea_bulletins to authenticated;
create policy "admins_read_pronarea" on public.gdv_pronarea_bulletins for select to authenticated
 using (exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
create policy "admins_insert_pronarea" on public.gdv_pronarea_bulletins for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.site_admins a where a.user_id=(select auth.uid())));
-- No update/delete desde cliente: registro auditable e inmutable.
