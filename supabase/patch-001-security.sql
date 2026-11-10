-- Only needed if you ran schema.sql BEFORE this file existed. Safe to run more than once.
create or replace function private.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare
  h  text := nullif(current_setting('request.headers', true), '');
  ip text;
begin
  if h is null then return null; end if;
  -- cf-connecting-ip is set by the CDN in front of Supabase and cannot be forged by the caller.
  -- The first x-forwarded-for entry CAN be forged, so it is only a fallback.
  ip := coalesce(nullif(btrim(h::json ->> 'cf-connecting-ip'), ''),
                 nullif(btrim(split_part(h::json ->> 'x-forwarded-for', ',', 1)), ''));
  if ip is null or ip !~ '^[0-9A-Fa-f:.]{3,45}$' then return null; end if;
  return ip;
exception when others then return null;
end $$;
revoke execute on function private.client_ip() from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
