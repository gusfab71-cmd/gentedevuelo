-- This RPC is callable only by the server-side login function. It never exposes email to clients.
create table gdv_private.login_windows(username_hash text primary key,attempts integer not null,started_at timestamptz not null);
alter table gdv_private.login_windows enable row level security;
revoke all on gdv_private.login_windows from public,anon,authenticated;
create index login_windows_started on gdv_private.login_windows(started_at);
create function public.gdv_login_lookup(p_username text) returns text language plpgsql security definer set search_path='' as $$
declare attempt_count integer; target_email text; key text;
begin
 if length(p_username) not between 3 and 25 then return null;end if;
 key:=md5(lower(p_username));
 delete from gdv_private.login_windows where started_at<now()-interval '1 day';
 insert into gdv_private.login_windows(username_hash,attempts,started_at) values(key,1,now())
 on conflict(username_hash) do update set attempts=case when gdv_private.login_windows.started_at<now()-interval '5 minutes' then 1 else gdv_private.login_windows.attempts+1 end,
 started_at=case when gdv_private.login_windows.started_at<now()-interval '5 minutes' then now() else gdv_private.login_windows.started_at end
 returning attempts into attempt_count;
 if attempt_count>10 then return '__rate_limited__';end if;
 select u.email into target_email from auth.users u join public.profiles p on p.id=u.id where lower(p.username)=lower(p_username);
 return target_email;
end $$;
revoke all on function public.gdv_login_lookup(text) from public,anon,authenticated;
grant execute on function public.gdv_login_lookup(text) to service_role;
