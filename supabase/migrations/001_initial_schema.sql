create extension if not exists pgcrypto;

create type public.study_status as enum ('draft', 'analysed', 'stale');
create type public.theme_status as enum ('draft', 'approved', 'rejected');
create type public.finding_strength as enum ('emerging', 'recurring', 'dominant');

create table public.studies (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null, goal text not null default '', context text not null default '', target_users text not null default '',
  hypotheses text not null default '', questions jsonb not null default '[]', status public.study_status not null default 'draft',
  source_version integer not null default 1, approved_analysis_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.participants (
  id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
  code text not null, role text not null default '', segment text not null default '', demographics jsonb not null default '{}', unique(study_id, code)
);
create table public.interviews (
  id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict, title text not null, source_type text not null,
  raw_storage_path text, status text not null default 'processing', summary text, source_version integer not null default 1,
  created_at timestamptz not null default now()
);
create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(), interview_id uuid not null references public.interviews(id) on delete cascade,
  ordinal integer not null, speaker text not null, raw_text text not null, analysis_text text not null,
  start_offset integer not null, end_offset integer not null, start_ms integer, end_ms integer, unique(interview_id, ordinal)
);
create table public.redactions (
  id uuid primary key default gen_random_uuid(), segment_id uuid not null references public.transcript_segments(id) on delete cascade,
  kind text not null, start_offset integer not null, end_offset integer not null, encrypted_value text not null
);
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
  source_version integer not null, provider text not null, model_snapshot text not null, status text not null default 'queued',
  failure_reason text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);
alter table public.studies add constraint approved_analysis_fk foreign key (approved_analysis_id) references public.analysis_runs(id) on delete set null;
create table public.themes (
  id uuid primary key default gen_random_uuid(), analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  curated_from_id uuid references public.themes(id), title text not null, summary text not null,
  strength public.finding_strength not null, participant_count integer not null, status public.theme_status not null default 'draft',
  tags jsonb not null default '[]', canvas_x real not null default 0, canvas_y real not null default 0, created_at timestamptz not null default now()
);
create table public.evidence_links (
  id uuid primary key default gen_random_uuid(), theme_id uuid not null references public.themes(id) on delete cascade,
  segment_id uuid not null references public.transcript_segments(id) on delete restrict, quote text not null,
  source_start integer not null, source_end integer not null, analysis_version integer not null,
  constraint positive_source_range check (source_start >= 0 and source_end > source_start)
);
create table public.share_links (
  id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now(),
  constraint future_expiry check (expires_at > created_at)
);

alter table public.studies enable row level security;
alter table public.participants enable row level security;
alter table public.interviews enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.redactions enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.themes enable row level security;
alter table public.evidence_links enable row level security;
alter table public.share_links enable row level security;

create policy "owners manage studies" on public.studies for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage participants" on public.participants for all to authenticated using (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid()));
create policy "owners manage interviews" on public.interviews for all to authenticated using (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid()));
create policy "owners manage transcript segments" on public.transcript_segments for all to authenticated using (exists(select 1 from public.interviews i join public.studies s on s.id=i.study_id where i.id=interview_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.interviews i join public.studies s on s.id=i.study_id where i.id=interview_id and s.owner_id=auth.uid()));
create policy "owners manage redactions" on public.redactions for all to authenticated using (exists(select 1 from public.transcript_segments ts join public.interviews i on i.id=ts.interview_id join public.studies s on s.id=i.study_id where ts.id=segment_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.transcript_segments ts join public.interviews i on i.id=ts.interview_id join public.studies s on s.id=i.study_id where ts.id=segment_id and s.owner_id=auth.uid()));
create policy "owners manage analyses" on public.analysis_runs for all to authenticated using (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid()));
create policy "owners manage themes" on public.themes for all to authenticated using (exists(select 1 from public.analysis_runs a join public.studies s on s.id=a.study_id where a.id=analysis_run_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.analysis_runs a join public.studies s on s.id=a.study_id where a.id=analysis_run_id and s.owner_id=auth.uid()));
create policy "owners manage evidence" on public.evidence_links for all to authenticated using (exists(select 1 from public.themes t join public.analysis_runs a on a.id=t.analysis_run_id join public.studies s on s.id=a.study_id where t.id=theme_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.themes t join public.analysis_runs a on a.id=t.analysis_run_id join public.studies s on s.id=a.study_id where t.id=theme_id and s.owner_id=auth.uid()));
create policy "owners manage shares" on public.share_links for all to authenticated using (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid())) with check (exists(select 1 from public.studies s where s.id=study_id and s.owner_id=auth.uid()));

insert into storage.buckets (id, name, public) values ('interview-sources', 'interview-sources', false) on conflict do nothing;
create policy "owners upload interview sources" on storage.objects for insert to authenticated with check (bucket_id='interview-sources' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "owners read interview sources" on storage.objects for select to authenticated using (bucket_id='interview-sources' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "owners delete interview sources" on storage.objects for delete to authenticated using (bucket_id='interview-sources' and (storage.foldername(name))[1]=auth.uid()::text);
