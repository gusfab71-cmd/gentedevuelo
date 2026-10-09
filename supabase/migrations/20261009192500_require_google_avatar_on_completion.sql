-- Activar después de publicar el formulario que exige UNA foto (sin avatares
-- prediseñados) y verificar la URL de la versión desplegada en Vercel.
-- Solo controla la transición de onboarding pendiente a completo.
-- No cambia registros completados ni elimina cuentas.
CREATE OR REPLACE FUNCTION gdv_private.validate_google_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF old.onboarding_completed = false AND new.onboarding_completed = true THEN
    IF char_length(btrim(coalesce(new.username,''))) < 3
       OR new.username ~* '^piloto_[0-9a-f]{12}$'
       OR char_length(btrim(coalesce(new.full_name,''))) < 2
       OR char_length(btrim(coalesce(new.aviation_role,''))) < 3 THEN
      RAISE EXCEPTION 'Completá nombre visible, nombre de usuario y actividad aeronáutica antes de participar';
    END IF;
    -- No aceptar avatares del sitio ni imágenes remotas/externas:
    -- imagen subida a Cloudflare al directorio específico de este integrante.
    IF coalesce(new.avatar_url, '') !~ (
      '^https://media[.]gentedevuelo[.]com/imagenes/' ||
      new.id::text ||
      '/[0-9a-f-]{36}[.](jpg|png|webp)$'
    ) THEN
      RAISE EXCEPTION 'Para completar el registro, subí una fotografía personal o relacionada con la aviación';
    END IF;
  END IF;
  RETURN new;
END;
$function$;
