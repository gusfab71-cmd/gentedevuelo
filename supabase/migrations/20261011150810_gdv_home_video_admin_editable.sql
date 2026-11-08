-- Video destacado editable desde el panel administrativo de Gente de Vuelo.
CREATE TABLE IF NOT EXISTS public.gdv_home_video (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title text NOT NULL DEFAULT 'STOL en acción' CHECK (char_length(title) BETWEEN 1 AND 90),
  video_url text NOT NULL DEFAULT '' CHECK (video_url = '' OR (char_length(video_url) <= 2048 AND video_url ~* '^https://[^[:space:]]+$')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.gdv_home_video ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gdv_home_video FROM anon, authenticated;
GRANT SELECT ON TABLE public.gdv_home_video TO anon, authenticated;
GRANT UPDATE (title, video_url, updated_at, updated_by) ON TABLE public.gdv_home_video TO authenticated;

CREATE POLICY "Vídeo de portada visible para todos"
  ON public.gdv_home_video FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Solo administradores pueden cambiar vídeo de portada"
  ON public.gdv_home_video FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.site_admins AS a WHERE a.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.site_admins AS a WHERE a.user_id = (SELECT auth.uid())));

INSERT INTO public.gdv_home_video (id, title, video_url)
VALUES (1, 'STOL en acción', '')
ON CONFLICT (id) DO NOTHING;
