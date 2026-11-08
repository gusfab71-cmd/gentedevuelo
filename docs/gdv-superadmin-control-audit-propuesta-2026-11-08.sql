-- Gente de Vuelo / AeroSuite: auditoría de suspensión y rehabilitación de cuentas.
-- Migra únicamente estructura, NO suspende ni altera cuentas existentes.
-- Acciones ejecutadas solo por la Edge Function gdv-superadmin-account-control.
CREATE TABLE IF NOT EXISTS public.gdv_superadmin_account_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  actor_id uuid NOT NULL,
  actor_email text NOT NULL,
  target_id uuid NOT NULL,
  target_email text NOT NULL,
  action text NOT NULL CHECK (action IN ('suspend', 'restore')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 8 AND 1000),
  outcome text NOT NULL DEFAULT 'started'
    CHECK (outcome IN ('started', 'success', 'failed')),
  error_code text
);
CREATE INDEX IF NOT EXISTS gdv_account_control_target_created_idx
  ON public.gdv_superadmin_account_control_audit(target_id,created_at DESC);
CREATE INDEX IF NOT EXISTS gdv_account_control_actor_created_idx
  ON public.gdv_superadmin_account_control_audit(actor_id,created_at DESC);

ALTER TABLE public.gdv_superadmin_account_control_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gdv_superadmin_account_control_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gdv_superadmin_account_control_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gdv_superadmin_account_control_audit TO service_role;
DROP POLICY IF EXISTS gdv_account_control_superadmin_read ON public.gdv_superadmin_account_control_audit;
CREATE POLICY gdv_account_control_superadmin_read
  ON public.gdv_superadmin_account_control_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.aerosuite_superadmins s
      WHERE s.user_id = (SELECT auth.uid())
    )
  );
