-- Academia del Alumno: práctica educativa PPA mientras el banco se revisa.
-- Permite SELECT solo a usuarios autenticados con rol Alumno en una
-- institución AeroSuite cuya licencia todavía permite acceder.
-- No se abre el banco a anon, instructores, pilotos, secretaría ni dirección.
-- La política ppa_admin_read existente continúa vigente.
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
