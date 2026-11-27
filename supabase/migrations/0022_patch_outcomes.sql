-- The patching result, recorded per plan.
--
-- Approval says the work may go ahead; the outcome says what actually happened
-- when it ran. Engineers record Success, Failed or Partial update (or put the
-- plan back to "Not run") straight on the register row, and the printed report
-- carries the same value next to the sign-off.

alter table public.patch_schedules
  add column if not exists outcome text not null default 'pending'
    check (outcome in ('pending', 'success', 'failed', 'partial'));

alter table public.patch_schedules
  add column if not exists outcome_by_name text not null default '';

alter table public.patch_schedules
  add column if not exists outcome_at timestamptz;

create index if not exists patch_schedules_outcome_idx
  on public.patch_schedules (outcome);

-- The person who runs the patching records the result, so the handler must be
-- able to update the row as well as the person who wrote the plan.
drop policy if exists patch_schedules_update on public.patch_schedules;
create policy patch_schedules_update on public.patch_schedules
  for update to authenticated
  using (created_by = auth.uid() or handler_id = auth.uid() or public.is_leadership())
  with check (created_by = auth.uid() or handler_id = auth.uid() or public.is_leadership());

comment on column public.patch_schedules.outcome is
  'Result of the patching run: pending (not run), success, failed or partial.';
comment on column public.patch_schedules.outcome_by_name is
  'Name of the person who recorded the outcome.';
comment on column public.patch_schedules.outcome_at is
  'When the outcome was recorded.';
