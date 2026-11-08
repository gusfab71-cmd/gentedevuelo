-- Acceso exclusivamente de lectura al banco PPA para Alumnos con una institución habilitada.
-- La política preexistente ppa_admin_read de Gente de Vuelo se conserva.
-- Se reutiliza aerosuite_my_institution_access_v2, que valida sesión, rol y licencia.
create policy ppa_aerosuite_student_practice_read
on public.gdv_ppa_questions
for select to authenticated
using (
  (select exists (
    select 1
    from public.aerosuite_my_institution_access_v2() AS access
    where access.my_role='alumno' and access.can_access IS TRUE
  ))
);