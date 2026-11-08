-- Mejora no destructiva de políticas y eliminación de un índice redundante.
-- Equivalencia de autorización: auth.uid() pasa a un SELECT sin argumentos
-- que PostgreSQL puede calcular una sola vez por sentencia.
-- Se conservan roles y condiciones de membresía y licencia en el helper.
ALTER POLICY aerosuite_academy_resource_insert
  ON public.aerosuite_academy_resources
  WITH CHECK (
    created_by=(SELECT auth.uid())
    AND aerosuite_internal.aerosuite_academy_authorized(institution_id,'write')
  );

ALTER POLICY aerosuite_academy_resource_delete
  ON public.aerosuite_academy_resources
  USING (
    aerosuite_internal.aerosuite_academy_authorized(institution_id,'manage')
    OR (
      created_by=(SELECT auth.uid())
      AND aerosuite_internal.aerosuite_academy_authorized(institution_id,'write')
    )
  );

-- Este índice tiene idéntico esquema que aerosuite_money_inst_created:
-- (institution_id, created_at DESC), sin UNIQUE. El que se conserva
-- tuvo mayor uso en pg_stat_user_indexes (118 vs. 1).
DROP INDEX IF EXISTS public.aerosuite_money_movement_period_idx;
