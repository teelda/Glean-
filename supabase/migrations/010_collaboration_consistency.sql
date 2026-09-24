alter table public.form_invitations
  add column if not exists accepted_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists form_invites_accepted_by_idx
  on public.form_invitations(accepted_by_user_id)
  where accepted_by_user_id is not null;

create or replace function public.accept_form_invitation(invite_hash text, accepting_user uuid, accepting_email text)
returns uuid language plpgsql security definer set search_path=public as $$
declare invitation public.form_invitations;
begin
 select * into invitation from public.form_invitations where token_hash=invite_hash for update;
 if not found or invitation.revoked_at is not null or invitation.expires_at<=now() or invitation.email<>lower(accepting_email) then return null; end if;
 if invitation.accepted_at is not null then
   if invitation.accepted_by_user_id=accepting_user and exists(select 1 from public.form_members where form_id=invitation.form_id and user_id=accepting_user) then return invitation.form_id; end if;
   return null;
 end if;
 insert into public.form_members(form_id,user_id,role) values(invitation.form_id,accepting_user,invitation.role)
 on conflict(form_id,user_id) do update set role=excluded.role;
 update public.form_invitations set accepted_at=now(), accepted_by_user_id=accepting_user where id=invitation.id;
 return invitation.form_id;
end; $$;

revoke all on function public.accept_form_invitation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_form_invitation(text,uuid,text) to service_role;
