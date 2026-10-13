-- Permite al administrador mover y redimensionar el video de la portada.
-- Si las tres columnas son NULL, se utiliza la posición original.
ALTER TABLE public.gdv_home_video
  ADD COLUMN IF NOT EXISTS pos_x_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS pos_y_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS width_px integer;

ALTER TABLE public.gdv_home_video
  DROP CONSTRAINT IF EXISTS gdv_home_video_position_valid;

ALTER TABLE public.gdv_home_video
  ADD CONSTRAINT gdv_home_video_position_valid
  CHECK (
    (pos_x_pct IS NULL AND pos_y_pct IS NULL AND width_px IS NULL)
    OR (
      pos_x_pct BETWEEN 0 AND 100
      AND pos_y_pct BETWEEN 0 AND 100
      AND width_px BETWEEN 160 AND 360
    )
  );

-- Se conservan las políticas existentes:
-- SELECT público y UPDATE exclusivo de usuarios en site_admins.
