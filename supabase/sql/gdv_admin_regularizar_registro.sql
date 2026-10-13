-- Función protegida desplegada en Supabase. Fuente sincronizada.
CREATE OR REPLACE FUNCTION public.gdv_admin_regularizar_registro(p_user_id uuid, p_username text DEFAULT NULL::text, p_aviation_role text DEFAULT NULL::text)
 RETURNS TABLE(out_username text, out_aviation_role text, out_onboarding_completed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_profile public.profiles%ROWTYPE;
  proposed_username text := NULLIF(pg_catalog.btrim(p_username), '');
  proposed_role text := NULLIF(pg_catalog.btrim(p_aviation_role), '');
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.site_admins s WHERE s.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Solo administración puede regularizar perfiles'
      USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.site_admins s WHERE s.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.gdv_moderators m WHERE m.user_id = p_user_id)
  THEN
    RAISE EXCEPTION 'Cuenta protegida o no válida'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_profile
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El perfil solicitado no existe';
  END IF;
  IF current_profile.onboarding_completed THEN
    RAISE EXCEPTION 'Este registro ya está completo; no requiere regularización';
  END IF;

  IF proposed_username IS NOT NULL THEN
    IF proposed_username !~ '^[A-Za-z0-9_-]{3,25}$'
       OR pg_catalog.lower(proposed_username) IN
         ('admin','administrador','moderador','shimoda','gentedevuelo','soporte')
       OR proposed_username ~* '^piloto_[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Nombre de usuario no válido o provisorio';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> p_user_id
        AND pg_catalog.lower(p.username) = pg_catalog.lower(proposed_username)
    ) THEN
      RAISE EXCEPTION 'Este nombre de usuario ya está en uso';
    END IF;
  END IF;

  IF proposed_role IS NOT NULL AND proposed_role <> ALL (ARRAY[
    'Entusiasta de la aviación','Estudiante de piloto','Piloto privado',
    'Piloto comercial','Instructor de vuelo','Aeromodelista',
    'Piloto de planeador','Piloto de ultraliviano','Piloto de helicóptero',
    'Piloto de paramotor','Constructor de experimentales',
    'Simulador de vuelo','Otro'
  ]::text[]) THEN
    RAISE EXCEPTION 'Actividad aeronáutica no válida';
  END IF;

  IF (proposed_username IS NULL OR proposed_username = current_profile.username)
     AND (proposed_role IS NULL OR proposed_role = current_profile.aviation_role)
  THEN
    RAISE EXCEPTION 'No hay modificaciones para guardar';
  END IF;

  -- La actualización mantiene intactos avatar_url y onboarding_completed.
  UPDATE public.profiles p
  SET username = COALESCE(proposed_username, p.username),
      aviation_role = COALESCE(proposed_role, p.aviation_role)
  WHERE p.id = p_user_id;

  RETURN QUERY
    SELECT p.username, p.aviation_role, p.onboarding_completed
    FROM public.profiles p WHERE p.id = p_user_id;
END
$function$


REVOKE ALL ON FUNCTION public.gdv_admin_regularizar_registro(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdv_admin_regularizar_registro(uuid,text,text) TO authenticated;
