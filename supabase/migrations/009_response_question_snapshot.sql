-- Preserve the wording respondents actually answered when forms are later edited.
alter table public.form_responses add column if not exists question_snapshot jsonb;
