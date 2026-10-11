-- Control de visibilidad del video de portada.
ALTER TABLE public.gdv_home_video
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
GRANT UPDATE (is_active) ON TABLE public.gdv_home_video TO authenticated;
