alter table public.studies add column if not exists snapshot jsonb not null default '{}';
create index if not exists studies_owner_updated_idx on public.studies(owner_id, updated_at desc);
