-- Activar esta migración únicamente después de que Vercel haya publicado
-- el formulario Google con selector de foto/avatar, para no bloquear a usuarios
-- que todavía estén cargando la interfaz anterior.
-- Solo se valida el paso de pendiente a registrado. No se modifican cuentas existentes.
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
    IF nullif(btrim(coalesce(new.avatar_url,'')),'') IS NULL
       OR (
         new.avatar_url NOT IN (
          'https://gentedevuelo.com/assets/avatares/piloto.svg',
          'https://gentedevuelo.com/assets/avatares/avion.svg',
          'https://gentedevuelo.com/assets/avatares/brujula.svg'
         )
         AND new.avatar_url !~ (
          '^https://media[.]gentedevuelo[.]com/imagenes/' ||
          new.id::text ||
          '/[0-9a-f-]{36}[.](jpg|png|webp)$'
         )
         AND NOT (
           old.avatar_url = new.avatar_url
           AND old.avatar_url ~ '^https://'
         )
       )
    THEN
      RAISE EXCEPTION 'Para completar el registro, elegí una foto o un avatar de perfil';
    END IF;
  END IF;
  RETURN new;
END;
$function$;
