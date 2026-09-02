create type public.form_status as enum ('draft', 'published', 'archived');

create table public.research_forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  study_id uuid references public.studies(id) on delete set null,
  name text not null,
  slug text not null,
  sections jsonb not null default '[]',
  status public.form_status not null default 'draft',
  public_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.research_forms(id) on delete cascade,
  public_token text not null,
  answers jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.research_forms enable row level security;
alter table public.form_responses enable row level security;

create policy "owners manage research forms" on public.research_forms
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners read form responses" on public.form_responses
  for select to authenticated
  using (exists(select 1 from public.research_forms f where f.id=form_id and f.owner_id=auth.uid()));

create index research_forms_public_token_idx on public.research_forms(public_token);
create index form_responses_form_id_idx on public.form_responses(form_id);
