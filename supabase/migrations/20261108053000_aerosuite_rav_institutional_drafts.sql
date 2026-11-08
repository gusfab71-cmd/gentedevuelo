-- AeroSuite RAV: archivo institucional de BORRADORES y REVISIONES INTERNAS.
-- No implementa firma, certificación, presentación ni aprobación regulatoria ante ANAC.
-- NUNCA modifica vuelos, horas, informes ni miembros existentes.
CREATE TABLE IF NOT EXISTS public.aerosuite_rav_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.aerosuite_institutions(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES auth.users(id),
 period_from date NOT NULL,
 period_to date NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','returned','reviewed')),
 observations text NOT NULL DEFAULT '' CHECK(length(observations)<=1500),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT rav_dates_valid CHECK(period_from >= date '2020-01-01' AND period_to>=period_from AND period_to<=period_from+366),
 CONSTRAINT rav_institution_doc_unique UNIQUE(institution_id,id)
);
CREATE TABLE IF NOT EXISTS public.aerosuite_rav_flights (
 institution_id uuid NOT NULL,
 rav_id uuid NOT NULL,
 report_id uuid NOT NULL REFERENCES public.aerosuite_flight_reports(id),
 booking_id uuid NOT NULL REFERENCES public.aerosuite_flight_bookings(id),
 student_id uuid NOT NULL REFERENCES auth.users(id),
 flight_date date NOT NULL,
 flight_minutes integer NOT NULL CHECK(flight_minutes BETWEEN 1 AND 600),
 report_revision integer NOT NULL CHECK(report_revision>0),
 flight_snapshot jsonb NOT NULL,
 added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(rav_id,report_id),
 CONSTRAINT rav_flight_document_fk FOREIGN KEY(institution_id,rav_id)
  REFERENCES public.aerosuite_rav_documents(institution_id,id) ON DELETE CASCADE,
 CONSTRAINT rav_report_once UNIQUE(institution_id,report_id)
);
CREATE INDEX IF NOT EXISTS rav_doc_institution_status_idx ON public.aerosuite_rav_documents(institution_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.aerosuite_rav_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 institution_id uuid NOT NULL,
 rav_id uuid NOT NULL REFERENCES public.aerosuite_rav_documents(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL CHECK(operation IN ('create','revise','submit','return','review')),
 before_data jsonb,
 after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rav_audit_institution_idx ON public.aerosuite_rav_audit(institution_id,rav_id,id);
ALTER TABLE public.aerosuite_rav_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aerosuite_rav_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aerosuite_rav_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aerosuite_rav_documents,public.aerosuite_rav_flights,public.aerosuite_rav_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.aerosuite_rav_audit_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.aerosuite_rav_manage(
 p_institution_id uuid,p_action text,p_rav_id uuid DEFAULT NULL,p_student_id uuid DEFAULT NULL,
 p_report_ids uuid[] DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,
 p_observations text DEFAULT NULL,p_expected_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_actor uuid:=auth.uid();v_role text;v_mode text;v_now date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_doc public.aerosuite_rav_documents%rowtype;
 v_before jsonb;v_after jsonb;v_id uuid;v_report_id uuid;v_r record;
 v_merged uuid[];v_total integer;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode
 FROM public.aerosuite_institution_members m JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.institution_id=p_institution_id AND m.user_id=v_actor AND m.role IN ('administrador','secretaria')
 LIMIT 1;
 IF v_actor IS NULL OR v_role IS NULL OR v_mode NOT IN ('trial','active','grace') THEN
  RAISE EXCEPTION 'Solo Dirección/Secretaría con acceso de escritura pueden gestionar RAV.' USING errcode='42501';
 END IF;
 IF p_action NOT IN ('create','revise','submit','return','review') THEN
  RAISE EXCEPTION 'Acción RAV inválida: no se permite certificar ni firmar desde AeroSuite.' USING errcode='22023';
 END IF;
 IF length(coalesce(p_observations,''))>1500 THEN
  RAISE EXCEPTION 'Observaciones demasiado extensas.' USING errcode='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('aerosuite_rav_'||p_institution_id::text,0));
 IF p_action='create' THEN
  IF p_rav_id IS NOT NULL OR p_student_id IS NULL OR p_from IS NULL OR p_to IS NULL
    OR p_from<date '2020-01-01' OR p_to>v_now OR p_to<p_from OR p_to>p_from+366 THEN
    RAISE EXCEPTION 'Alumno y período de vuelo válidos obligatorios (máximo 366 días).' USING errcode='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.aerosuite_institution_members m
     WHERE m.institution_id=p_institution_id AND m.user_id=p_student_id AND m.role='alumno') THEN
   RAISE EXCEPTION 'El alumno no pertenece a esta escuela.' USING errcode='42501';
  END IF;
  INSERT INTO public.aerosuite_rav_documents(institution_id,student_id,period_from,period_to,created_by,updated_by)
  VALUES(p_institution_id,p_student_id,p_from,p_to,v_actor,v_actor) RETURNING * INTO v_doc;
  v_id:=v_doc.id;
  v_before:=NULL;
 ELSIF p_action='revise' THEN
  SELECT * INTO v_doc FROM public.aerosuite_rav_documents
    WHERE institution_id=p_institution_id AND id=p_rav_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status NOT IN ('draft','returned')
    OR p_expected_revision IS DISTINCT FROM v_doc.revision THEN
   RAISE EXCEPTION 'Borrador inexistente, cerrado o modificado por otra persona. Recargá antes de continuar.' USING errcode='22023';END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from<date '2020-01-01' OR p_to>v_now OR p_to<p_from OR p_to>p_from+366 THEN
   RAISE EXCEPTION 'Período revisado inválido.' USING errcode='22023';END IF;
  v_before:=to_jsonb(v_doc)||jsonb_build_object('flights',
    (SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) FROM public.aerosuite_rav_flights f WHERE f.rav_id=v_doc.id));
  DELETE FROM public.aerosuite_rav_flights WHERE rav_id=v_doc.id AND institution_id=p_institution_id;
  UPDATE public.aerosuite_rav_documents SET period_from=p_from,period_to=p_to,status='draft',
    observations='',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1,updated_by=v_actor,updated_at=now()
  WHERE id=v_doc.id RETURNING * INTO v_doc;
  v_id:=v_doc.id;
 ELSE
  SELECT * INTO v_doc FROM public.aerosuite_rav_documents
    WHERE institution_id=p_institution_id AND id=p_rav_id FOR UPDATE;
  IF NOT FOUND OR p_expected_revision IS DISTINCT FROM v_doc.revision THEN
   RAISE EXCEPTION 'RAV inexistente o versión desactualizada. Recargá antes de continuar.' USING errcode='22023';END IF;
  v_before:=to_jsonb(v_doc);
  v_id:=v_doc.id;
 END IF;

 IF p_action IN ('create','revise') THEN
  v_merged:=coalesce(p_report_ids,array[]::uuid[]);
  IF coalesce(array_length(v_merged,1),0)<1 OR array_length(v_merged,1)>100
    OR EXISTS(SELECT 1 FROM unnest(v_merged) x WHERE x IS NULL)
    OR (SELECT count(DISTINCT x) FROM unnest(v_merged) x)<>array_length(v_merged,1) THEN
    RAISE EXCEPTION 'Seleccioná entre 1 y 100 informes únicos.' USING errcode='22023';
  END IF;
  FOREACH v_report_id IN ARRAY v_merged LOOP
   SELECT r.id AS report_id,r.institution_id,r.status AS report_status,r.revision AS report_revision,
     r.flight_minutes,r.logbook_entry,r.instructor_id,
     b.id AS booking_id,b.student_id,b.starts_at,b.status AS booking_status,b.with_instructor,b.instructor_id AS booking_instructor
   INTO v_r
   FROM public.aerosuite_flight_reports r
   JOIN public.aerosuite_flight_bookings b ON b.id=r.booking_id AND b.institution_id=r.institution_id
   WHERE r.id=v_report_id AND r.institution_id=p_institution_id AND b.student_id=v_doc.student_id;
   IF NOT FOUND OR v_r.report_status<>'approved' OR v_r.booking_status<>'completed'
      OR coalesce(v_r.with_instructor,false) IS NOT TRUE OR v_r.instructor_id IS NULL
      OR v_r.instructor_id IS DISTINCT FROM v_r.booking_instructor
      OR (v_r.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date NOT BETWEEN v_doc.period_from AND v_doc.period_to
      OR coalesce(v_r.logbook_entry->>'flight_role','')<>'instructor'
      OR coalesce(v_r.logbook_entry->>'aircraft_registration','')=''
      OR coalesce(v_r.logbook_entry->>'flight_date','')=''
      OR NOT (v_r.logbook_entry ? 'landings_count' OR v_r.logbook_entry ? 'flight_count') THEN
     RAISE EXCEPTION 'El informe % no es un vuelo de instrucción aprobado, completo y documentado para este alumno y período.',v_report_id
      USING errcode='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM public.aerosuite_flight_checkouts c
     WHERE c.booking_id=v_r.booking_id AND c.institution_id=p_institution_id
       AND c.book_minutes<>v_r.flight_minutes) THEN
    RAISE EXCEPTION 'Diferencia de minutos entre informe y caja. Reconciliá antes del RAV.' USING errcode='22023';
   END IF;
   INSERT INTO public.aerosuite_rav_flights(institution_id,rav_id,report_id,booking_id,student_id,flight_date,
     flight_minutes,report_revision,flight_snapshot)
   VALUES(p_institution_id,v_id,v_report_id,v_r.booking_id,v_r.student_id,
    (v_r.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    v_r.flight_minutes,v_r.report_revision,
    jsonb_build_object('booking_start_utc',v_r.starts_at,'flight_minutes',v_r.flight_minutes,
      'report_revision',v_r.report_revision,'logbook_entry',v_r.logbook_entry));
  END LOOP;
  v_total:=array_length(v_merged,1);
 ELSE
  IF p_action='submit' THEN
   IF v_doc.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'Solo un borrador o devolución puede enviarse.' USING errcode='22023';END IF;
   -- Verificar que las constancias de origen continúan aprobadas y sin nuevas revisiones.
   IF NOT EXISTS(SELECT 1 FROM public.aerosuite_rav_flights f WHERE f.rav_id=v_id) OR EXISTS(
     SELECT 1 FROM public.aerosuite_rav_flights f
     LEFT JOIN public.aerosuite_flight_reports r ON r.id=f.report_id AND r.institution_id=f.institution_id
     LEFT JOIN public.aerosuite_flight_bookings b ON b.id=f.booking_id AND b.institution_id=f.institution_id
     WHERE f.rav_id=v_id AND (r.id IS NULL OR r.status<>'approved' OR r.revision<>f.report_revision
      OR r.flight_minutes<>f.flight_minutes OR r.logbook_entry IS DISTINCT FROM f.flight_snapshot->'logbook_entry'
      OR b.status<>'completed')
   ) THEN
    RAISE EXCEPTION 'Cambió el informe o libro de origen. Revisá nuevamente el borrador.' USING errcode='22023';
   END IF;
   UPDATE public.aerosuite_rav_documents SET status='submitted',revision=revision+1,updated_by=v_actor,updated_at=now()
    WHERE id=v_id RETURNING * INTO v_doc;
  ELSIF p_action IN ('return','review') THEN
   IF v_role<>'administrador' OR v_doc.status<>'submitted' THEN
    RAISE EXCEPTION 'Solo Dirección puede devolver o revisar un RAV enviado.' USING errcode='42501';END IF;
   IF p_action='return' AND length(btrim(coalesce(p_observations,'')))<8 THEN
    RAISE EXCEPTION 'Indicá observaciones concretas para devolver el borrador.' USING errcode='22023';END IF;
   IF p_action='review' AND EXISTS(
     SELECT 1 FROM public.aerosuite_rav_flights f
     LEFT JOIN public.aerosuite_flight_reports r ON r.id=f.report_id AND r.institution_id=f.institution_id
     LEFT JOIN public.aerosuite_flight_bookings b ON b.id=f.booking_id AND b.institution_id=f.institution_id
     WHERE f.rav_id=v_id AND (r.id IS NULL OR r.status<>'approved' OR r.revision<>f.report_revision
      OR r.flight_minutes<>f.flight_minutes OR r.logbook_entry IS DISTINCT FROM f.flight_snapshot->'logbook_entry'
      OR b.status<>'completed')
   ) THEN
    RAISE EXCEPTION 'El informe de origen cambió después del envío. Devolvé para corregir el RAV.' USING errcode='22023';
   END IF;
   -- Nunca declarar certificado: reviewed = REVISIÓN DOCUMENTAL INTERNA.
   UPDATE public.aerosuite_rav_documents
     SET status=CASE WHEN p_action='review' THEN 'reviewed' ELSE 'returned' END,
         observations=left(btrim(coalesce(p_observations,'')),1500),
         reviewed_by=v_actor,reviewed_at=now(),
         revision=revision+1,updated_by=v_actor,updated_at=now()
    WHERE id=v_id RETURNING * INTO v_doc;
  END IF;
  SELECT count(*) INTO v_total FROM public.aerosuite_rav_flights WHERE rav_id=v_id;
 END IF;
 v_after:=to_jsonb(v_doc)||jsonb_build_object('flight_count',v_total,
  'total_minutes',(SELECT coalesce(sum(f.flight_minutes),0) FROM public.aerosuite_rav_flights f WHERE f.rav_id=v_id));
 INSERT INTO public.aerosuite_rav_audit(institution_id,rav_id,actor_id,operation,before_data,after_data)
  VALUES(p_institution_id,v_id,v_actor,p_action,v_before,v_after);
 RETURN jsonb_build_object('ok',true,'rav_id',v_id,'status',v_doc.status,'revision',v_doc.revision,
  'flight_count',v_total,'certified',false,'label','REVISIÓN INTERNA · NO CERTIFICADO');
END;
$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_rav_manage(uuid,text,uuid,uuid,uuid[],date,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_rav_manage(uuid,text,uuid,uuid,uuid[],date,date,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.aerosuite_rav_overview(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid:=auth.uid();v_role text;v_mode text;v_documents jsonb;v_candidates jsonb;v_students jsonb;
BEGIN
 SELECT m.role,private.aerosuite_access_mode(i.status,i.trial_ends_at,i.license_ends_at,now())
 INTO v_role,v_mode FROM public.aerosuite_institution_members m
 JOIN public.aerosuite_institutions i ON i.id=m.institution_id
 WHERE m.user_id=v_actor AND m.institution_id=p_institution_id AND m.role IN ('administrador','secretaria') LIMIT 1;
 IF v_actor IS NULL OR v_role IS NULL OR v_mode='blocked' THEN
  RAISE EXCEPTION 'Solo Dirección y Secretaría pueden consultar RAV institucional.' USING errcode='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'student_id',d.student_id,
  'student_name',coalesce(nullif(btrim(concat_ws(' ',mp.given_names,mp.family_names)),''),u.email,'Alumno'),
  'period_from',d.period_from,'period_to',d.period_to,'status',d.status,'observations',d.observations,
  'revision',d.revision,'created_at',d.created_at,'updated_at',d.updated_at,
  'reviewed_at',d.reviewed_at,'reviewed_by',d.reviewed_by,'created_by',d.created_by,
  'flights',coalesce((SELECT jsonb_agg(jsonb_build_object('report_id',f.report_id,'booking_id',f.booking_id,
    'flight_date',f.flight_date,'minutes',f.flight_minutes,'snapshot',f.flight_snapshot) ORDER BY f.flight_date,f.report_id)
    FROM public.aerosuite_rav_flights f WHERE f.rav_id=d.id),'[]'::jsonb),
  'history',coalesce((SELECT jsonb_agg(jsonb_build_object('operation',a.operation,'actor_id',a.actor_id,
    'at',a.created_at,'after',a.after_data) ORDER BY a.id) FROM public.aerosuite_rav_audit a
    WHERE a.rav_id=d.id),'[]'::jsonb)
 ) ORDER BY d.created_at DESC),'[]'::jsonb)
 INTO v_documents FROM public.aerosuite_rav_documents d
 LEFT JOIN auth.users u ON u.id=d.student_id
 LEFT JOIN public.aerosuite_member_profiles mp ON mp.user_id=d.student_id
 WHERE d.institution_id=p_institution_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'report_id',r.id,'booking_id',r.booking_id,'student_id',b.student_id,
  'flight_date',(b.starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  'minutes',r.flight_minutes,'registration',r.logbook_entry->>'aircraft_registration',
  'landings',coalesce(r.logbook_entry->>'landings_count',r.logbook_entry->>'flight_count','')
 ) ORDER BY b.starts_at DESC),'[]'::jsonb)
 INTO v_candidates FROM public.aerosuite_flight_reports r
 JOIN public.aerosuite_flight_bookings b ON b.id=r.booking_id AND b.institution_id=r.institution_id
 JOIN public.aerosuite_institution_members m ON m.institution_id=b.institution_id AND m.user_id=b.student_id AND m.role='alumno'
 WHERE r.institution_id=p_institution_id AND r.status='approved' AND b.status='completed'
  AND b.with_instructor IS TRUE AND r.instructor_id=b.instructor_id
  AND r.logbook_entry->>'flight_role'='instructor'
  AND (r.logbook_entry ? 'landings_count' OR r.logbook_entry ? 'flight_count')
  AND NOT EXISTS(SELECT 1 FROM public.aerosuite_rav_flights f WHERE f.institution_id=p_institution_id AND f.report_id=r.id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,
  'name',coalesce(nullif(btrim(concat_ws(' ',mp.given_names,mp.family_names)),''),u.email,'Alumno'))
  ORDER BY coalesce(mp.family_names,u.email)),'[]'::jsonb) INTO v_students
 FROM public.aerosuite_institution_members m
 LEFT JOIN public.aerosuite_member_profiles mp ON mp.user_id=m.user_id
 LEFT JOIN auth.users u ON u.id=m.user_id
 WHERE m.institution_id=p_institution_id AND m.role='alumno';
 RETURN jsonb_build_object('documents',v_documents,'candidates',v_candidates,'students',v_students,
  'read_only',v_mode NOT IN('trial','active','grace'),'certification_enabled',false,
  'disclaimer','RAV institucional para revisión documental interna. No equivale a certificación, firma ni presentación ante ANAC.');
END;
$fn$;
REVOKE ALL ON FUNCTION public.aerosuite_rav_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aerosuite_rav_overview(uuid) TO authenticated;
