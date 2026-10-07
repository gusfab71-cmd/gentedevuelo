-- La fuente en Noticias aeronáuticas queda opcional; el control editorial corresponde a moderación.
create or replace function gdv_private.validate_topic()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
 if length(btrim(new.title))<3 or length(btrim(new.content))<1 then raise exception 'Completá el título y el contenido'; end if;
 if cardinality(new.tags)>12 then raise exception 'Máximo 12 etiquetas'; end if;
 return new;
end
$function$;
