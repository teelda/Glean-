alter table public.research_forms add column if not exists public_token_hash text unique;
update public.research_forms
set public_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
where public_token is not null and public_token_hash is null;
drop index if exists research_forms_public_token_idx;
create unique index if not exists research_forms_public_token_hash_idx on public.research_forms(public_token_hash);

alter table public.form_responses alter column public_token drop not null;

create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);
alter table public.api_rate_limits enable row level security;

create or replace function public.consume_rate_limit(rate_key text, rate_limit integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  if rate_limit < 1 or window_seconds < 1 or length(rate_key) > 200 then return false; end if;
  insert into public.api_rate_limits as limits(key, window_started_at, request_count)
  values (rate_key, now(), 1)
  on conflict (key) do update set
    window_started_at = case when limits.window_started_at <= now() - make_interval(secs => window_seconds) then now() else limits.window_started_at end,
    request_count = case when limits.window_started_at <= now() - make_interval(secs => window_seconds) then 1 else limits.request_count + 1 end
  returning request_count <= rate_limit into allowed;
  return allowed;
end; $$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
