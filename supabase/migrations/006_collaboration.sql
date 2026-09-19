alter table public.research_forms add column if not exists version integer not null default 1;
alter table public.research_forms add column if not exists context jsonb not null default '{}';
alter table public.research_forms add column if not exists published_sections jsonb;
alter table public.research_forms add column if not exists published_name text;
alter table public.research_forms add column if not exists expires_at timestamptz;
update public.research_forms set published_sections=sections, published_name=name where status='published' and published_sections is null;

create table public.form_members (
  form_id uuid not null references public.research_forms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('editor','reviewer','viewer')),
  primary key(form_id,user_id)
);
create table public.form_invitations (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.research_forms(id) on delete cascade,
  email text not null, role text not null check(role in ('editor','reviewer','viewer')),
  token_hash text not null unique, expires_at timestamptz not null,
  accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.form_comments (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.research_forms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.form_members enable row level security;
alter table public.form_invitations enable row level security;
alter table public.form_comments enable row level security;
create policy "members see own membership" on public.form_members for select to authenticated using(user_id=auth.uid());
create policy "members read forms" on public.research_forms for select to authenticated using(exists(select 1 from public.form_members m where m.form_id=research_forms.id and m.user_id=auth.uid()));
create index form_members_user_idx on public.form_members(user_id);
create index form_invites_form_idx on public.form_invitations(form_id);
create index form_comments_form_idx on public.form_comments(form_id,created_at);
create index responses_pagination_idx on public.form_responses(form_id,created_at desc,id);

create function public.accept_form_invitation(invite_hash text, accepting_user uuid, accepting_email text)
returns uuid language plpgsql security definer set search_path=public as $$
declare invitation public.form_invitations;
begin
 select * into invitation from public.form_invitations where token_hash=invite_hash for update;
 if not found or invitation.revoked_at is not null or invitation.expires_at<=now() or invitation.email<>lower(accepting_email) then return null; end if;
 if invitation.accepted_at is not null then
   if exists(select 1 from public.form_members where form_id=invitation.form_id and user_id=accepting_user) then return invitation.form_id; end if;
   return null;
 end if;
 insert into public.form_members(form_id,user_id,role) values(invitation.form_id,accepting_user,invitation.role)
 on conflict(form_id,user_id) do update set role=excluded.role;
 update public.form_invitations set accepted_at=now() where id=invitation.id;
 return invitation.form_id;
end; $$;
revoke all on function public.accept_form_invitation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_form_invitation(text,uuid,text) to service_role;
