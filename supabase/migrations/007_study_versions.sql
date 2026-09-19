alter table public.studies add column if not exists client_id text;
alter table public.studies add column if not exists revision integer not null default 1;
alter table public.studies add column if not exists archived_at timestamptz;
update public.studies set client_id=coalesce(snapshot->>'id',id::text) where client_id is null;
-- Do not rewrite or delete existing research. New inserts use their own stable key.
create index if not exists studies_client_idx on public.studies(owner_id,client_id);
