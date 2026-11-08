-- Corrección del aviso por correo de nuevos integrantes.
-- PostgREST ejecuta RPC como service_role, sin SELECT directo sobre auth.users.
-- Encapsulamos la verificación sensible en una función de propietario postgres;
-- restringida a JWT service_role y sin permisos EXECUTE para usuarios comunes.
CREATE OR REPLACE FUNCTION public.gdv_email_claim_registration(p_limit integer DEFAULT 5)
RETURNS TABLE(id uuid, user_id uuid, subject text, body text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE r public.gdv_email_outbox%rowtype;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Restricted delivery';
  END IF;

  FOR r IN
    SELECT q.* FROM public.gdv_email_outbox AS q
    JOIN auth.users u ON u.id = q.user_id
    JOIN public.profiles p ON p.id = q.user_id
    WHERE q.kind = 'registration'
      AND (q.status = 'pending' OR (q.status = 'failed' AND q.attempts < 3))
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND p.onboarding_completed IS TRUE
    ORDER BY q.created_at
    FOR UPDATE OF q SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(p_limit, 1), 1), 10)
  LOOP
    UPDATE public.gdv_email_outbox AS q
    SET status = 'sending', attempts = attempts + 1
    WHERE q.id = r.id;

    RETURN QUERY SELECT r.id, r.user_id, r.subject, r.body;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.gdv_email_claim_registration(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdv_email_claim_registration(integer) TO service_role;
