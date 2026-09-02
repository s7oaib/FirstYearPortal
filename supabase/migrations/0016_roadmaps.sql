-- ===========================================================================
-- 0016_roadmaps.sql — individual development roadmaps (PRD 5.10)
--
-- A roadmap is a set of milestones at 30 days, 3–6 months, and 1–4 years,
-- generated from the student's own profile and then reviewed by a human
-- before the student ever sees it.
--
-- That last clause is the whole design, and it is enforced here rather than
-- in the application:
--
--   * The student SELECT policy requires `approval_status = 'approved'`. A
--     draft or a generation awaiting review does not exist for the student
--     it belongs to. PRD section 2 promises "a roadmap that a human mentor
--     has reviewed, not an unreviewed AI output" — a promise the application
--     could forget to keep, and the database cannot.
--
--   * `generated_by`, `provider`, and `model` are recorded on every version.
--     A student and a mentor should both be able to tell whether the advice
--     in front of them came from a language model or from the deterministic
--     rules, and which one. Untraceable advice is not reviewable advice.
--
--   * Superseding rather than editing. Regenerating marks the old version
--     'superseded' and writes a new row, so the thing a mentor approved stays
--     exactly as approved. Rewriting a roadmap in place would let the text a
--     mentor signed off change underneath their approval.
-- ===========================================================================

create type public.roadmap_source as enum ('rule_based', 'ai');

create type public.roadmap_status as enum (
  'draft', 'pending_mentor_review', 'approved', 'rejected', 'superseded'
);

create type public.milestone_horizon as enum (
  'thirty_days', 'three_to_six_months', 'one_to_four_years'
);

create table public.student_roadmaps (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,

  -- Provenance. `provider` and `model` stay NULL for a rule-based roadmap,
  -- which is itself the honest answer to "what produced this".
  generated_by    public.roadmap_source not null default 'rule_based',
  provider        text check (length(provider) <= 60),
  model           text check (length(model) <= 120),

  -- What the generator was working from, in the student's own words. Stored
  -- so a mentor reviewing in six months can see the inputs as they were,
  -- not as the profile has since become.
  inputs_summary  text check (length(inputs_summary) <= 4000),

  approval_status public.roadmap_status not null default 'draft',
  reviewed_by     uuid references public.faculty(id) on delete set null,
  reviewed_at     timestamptz,
  mentor_remarks  text check (length(mentor_remarks) <= 2000),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index student_roadmaps_student_idx
  on public.student_roadmaps (student_id, approval_status);
create index student_roadmaps_review_idx
  on public.student_roadmaps (approval_status);

create trigger student_roadmaps_touch_updated_at
  before update on public.student_roadmaps
  for each row execute function public.touch_updated_at();

create table public.roadmap_milestones (
  id           uuid primary key default gen_random_uuid(),
  roadmap_id   uuid not null references public.student_roadmaps(id) on delete cascade,
  horizon      public.milestone_horizon not null,
  title        text not null check (length(trim(title)) between 3 and 200),
  detail       text check (length(detail) <= 1000),

  -- The explanation. PRD 5.10 requires a roadmap to show which inputs drove
  -- each recommendation, so this is NOT NULL: a milestone that cannot say why
  -- it is there has no business being on someone's plan.
  rationale    text not null check (length(trim(rationale)) between 3 and 500),

  position     integer not null default 0,

  -- Progress is the student's to record.
  completed_at timestamptz,

  created_at   timestamptz not null default now()
);

create index roadmap_milestones_roadmap_idx
  on public.roadmap_milestones (roadmap_id, horizon, position);

-- --- Guards -----------------------------------------------------------------

/**
 * A student may tick a milestone off; they may not approve their own plan.
 *
 * Without this, the UPDATE policy that lets a student record progress would
 * also let them set `approval_status = 'approved'` and skip the review the
 * whole feature exists to guarantee.
 */
create or replace function public.guard_roadmap_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_reviewer boolean;
begin
  is_reviewer := public.is_admin() or public.can_faculty_view_student(new.student_id);

  if not is_reviewer then
    if tg_op = 'INSERT' then
      new.approval_status := 'draft';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.mentor_remarks := null;
    elsif new.approval_status is distinct from old.approval_status
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.mentor_remarks is distinct from old.mentor_remarks then
      raise exception 'Only a mentor or an administrator can review a roadmap.';
    end if;
  end if;

  return new;
end;
$$;

create trigger student_roadmaps_guard_approval
  before insert or update on public.student_roadmaps
  for each row execute function public.guard_roadmap_approval();

/**
 * Milestone text is fixed once written; only `completed_at` moves.
 *
 * A student marking progress must not be able to reword the plan a mentor
 * approved, and a reviewer who wants different wording should reject and
 * regenerate rather than quietly edit an approved document.
 */
create or replace function public.guard_milestone_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.detail is distinct from old.detail
     or new.rationale is distinct from old.rationale
     or new.horizon is distinct from old.horizon
     or new.roadmap_id is distinct from old.roadmap_id then
    raise exception 'A milestone''s wording cannot be changed. Regenerate the roadmap instead.';
  end if;
  return new;
end;
$$;

create trigger roadmap_milestones_guard_text
  before update on public.roadmap_milestones
  for each row execute function public.guard_milestone_text();

-- --- RLS --------------------------------------------------------------------

alter table public.student_roadmaps    enable row level security;
alter table public.roadmap_milestones  enable row level security;

-- The load-bearing policy: a student sees only what a human has approved.
create policy "student reads own approved roadmap" on public.student_roadmaps
  for select to authenticated
  using (
    student_id = public.current_student_id()
    and approval_status = 'approved'
  );

create policy "student records own progress" on public.student_roadmaps
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

create policy "staff reads roadmaps of visible students" on public.student_roadmaps
  for select to authenticated
  using (public.can_faculty_view_student(student_id));

create policy "staff reviews roadmaps of visible students" on public.student_roadmaps
  for update to authenticated
  using (public.can_faculty_view_student(student_id))
  with check (public.can_faculty_view_student(student_id));

create policy "staff creates roadmaps for visible students" on public.student_roadmaps
  for insert to authenticated
  with check (public.can_faculty_view_student(student_id));

create policy "admin reads all roadmaps" on public.student_roadmaps
  for select to authenticated using (public.is_admin());
create policy "admin writes roadmaps" on public.student_roadmaps
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Milestones inherit their roadmap's visibility. The bare EXISTS is doing the
-- work: `student_roadmaps` is itself RLS-protected, so a row only "exists"
-- here if one of the policies above already let the caller see it — which
-- means an unapproved roadmap's milestones are invisible to the student too.
create policy "read milestones of visible roadmaps" on public.roadmap_milestones
  for select to authenticated
  using (exists (
    select 1 from public.student_roadmaps r
    where r.id = roadmap_milestones.roadmap_id
  ));

create policy "student updates own milestone progress" on public.roadmap_milestones
  for update to authenticated
  using (exists (
    select 1 from public.student_roadmaps r
    where r.id = roadmap_milestones.roadmap_id
      and r.student_id = public.current_student_id()
      and r.approval_status = 'approved'
  ))
  with check (exists (
    select 1 from public.student_roadmaps r
    where r.id = roadmap_milestones.roadmap_id
      and r.student_id = public.current_student_id()
      and r.approval_status = 'approved'
  ));

create policy "staff writes milestones of visible roadmaps" on public.roadmap_milestones
  for all to authenticated
  using (exists (
    select 1 from public.student_roadmaps r
    where r.id = roadmap_milestones.roadmap_id
      and public.can_faculty_view_student(r.student_id)
  ))
  with check (exists (
    select 1 from public.student_roadmaps r
    where r.id = roadmap_milestones.roadmap_id
      and public.can_faculty_view_student(r.student_id)
  ));

create policy "admin writes milestones" on public.roadmap_milestones
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
