-- Ownership for research forms.
--
-- Before sign-in existed, /api/forms/publish accepted anonymous callers and
-- inserted rows with owner_id NULL. Those rows are now unreachable: every read
-- path filters on owner_id = <the caller>, and NULL never equals a uuid. They
-- are deliberately NOT backfilled to any account — an anonymous caller could
-- have written them, so handing them to a real user would attribute someone
-- else's data to that person.
--
-- The column stays nullable only because those rows still exist. Delete them
-- and the constraint below can be enabled.

-- The new ownership checks filter by owner, and listResponses joins through
-- research_forms on (id, owner_id). Neither had an index.
create index if not exists research_forms_owner_id_idx on public.research_forms(owner_id);

-- Rows published before authentication, kept for audit rather than assigned.
comment on column public.research_forms.owner_id is
  'Owner. NULL only on rows published before authentication existed (pre-003); those are unreachable through the app.';

-- Enable once the pre-auth rows are removed:
--   delete from public.research_forms where owner_id is null;
--   alter table public.research_forms alter column owner_id set not null;
