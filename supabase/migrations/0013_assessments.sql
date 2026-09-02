-- ===========================================================================
-- 0013_assessments.sql — assessment engine (PRD 5.7)
--
-- Question bank, assessment builder, attempts, answers, and results.
--
-- Three problems here cannot be expressed by row policies alone, and each is
-- solved the way an earlier migration already solved its own version of it:
--
--   1. A student needs UPDATE on their own answers so they can revise before
--      submitting, but must never write `awarded_points`, or the `score` on
--      their own attempt. Policies choose *rows*, not columns, so triggers
--      pin the graded ones — as 0009 did for achievement verification.
--
--   2. A student must not read `question_options.is_correct` before
--      answering, or the paper is an answer key. RLS cannot mask a column
--      either, so students read through a view that omits it — as guardian
--      contact is masked in `student_directory` (0003).
--
--   3. Psychometric results carry a stricter rule than anything else in this
--      portal (PRD 5.7, and the non-goals in section 2): the student and
--      their assigned mentor, nobody else. That is a policy here, not
--      something the application is trusted to remember.
-- ===========================================================================

create type public.assessment_kind as enum ('general', 'psychometric', 'english');

create type public.question_kind as enum (
  'single_choice', 'multiple_choice', 'true_false',
  'short_answer', 'long_answer', 'likert'
);

create type public.attempt_status as enum (
  'in_progress', 'submitted', 'graded', 'abandoned'
);

-- --- Assessments ------------------------------------------------------------

create table public.assessments (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (length(trim(title)) between 3 and 200),
  description         text check (length(description) <= 2000),
  kind                public.assessment_kind not null default 'general',

  -- Who built it. Referenced as faculty rather than users so the author has a
  -- name and a department without a second join.
  created_by          uuid references public.faculty(id) on delete set null,

  -- Audience. NULL in a scope column means "any", the convention
  -- `faculty_student_assignments` established in 0003.
  department_code     text references public.departments(code),
  semester            smallint check (semester between 1 and 2),
  section             text,

  opens_at            timestamptz,
  closes_at           timestamptz,
  duration_minutes    integer check (duration_minutes between 1 and 600),
  max_attempts        smallint not null default 1 check (max_attempts between 1 and 10),
  pass_percentage     numeric(5,2) check (pass_percentage between 0 and 100),
  randomise_questions boolean not null default false,

  -- Unpublished papers are invisible to students, so an author can build one
  -- over several sittings without a half-finished draft appearing to a class.
  is_published        boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint closes_after_opens check (
    opens_at is null or closes_at is null or closes_at > opens_at
  )
);

create index assessments_scope_idx
  on public.assessments (department_code, semester, section);
create index assessments_published_idx on public.assessments (is_published);
create index assessments_kind_idx on public.assessments (kind);

create trigger assessments_touch_updated_at
  before update on public.assessments
  for each row execute function public.touch_updated_at();

-- --- Questions --------------------------------------------------------------

create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  kind          public.question_kind not null,
  prompt        text not null check (length(trim(prompt)) between 3 and 2000),
  help_text     text check (length(help_text) <= 500),
  position      integer not null default 0,
  points        numeric(6,2) not null default 1 check (points >= 0),
  required      boolean not null default true,
  created_at    timestamptz not null default now()
);

create index questions_assessment_idx on public.questions (assessment_id, position);

create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label       text not null check (length(trim(label)) between 1 and 500),
  position    integer not null default 0,

  -- Objective marking. NULL means this question is not auto-marked:
  -- psychometric and Likert items score on `score_value` instead, because
  -- "correct" is not a meaningful idea for them.
  is_correct  boolean,

  -- What this option contributes on a Likert or psychometric scale.
  score_value numeric(6,2) not null default 0,

  created_at  timestamptz not null default now()
);

create index question_options_question_idx
  on public.question_options (question_id, position);

-- --- Attempts and answers ---------------------------------------------------

create table public.assessment_attempts (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  attempt_number smallint not null default 1 check (attempt_number >= 1),
  status         public.attempt_status not null default 'in_progress',
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,

  -- Written by the grading path only; the trigger below stops a student
  -- setting their own marks.
  score          numeric(8,2),
  max_score      numeric(8,2),
  percentage     numeric(5,2) check (percentage between 0 and 100),
  passed         boolean,
  graded_at      timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (assessment_id, student_id, attempt_number)
);

create index attempts_student_idx on public.assessment_attempts (student_id);
create index attempts_assessment_idx on public.assessment_attempts (assessment_id);
create index attempts_status_idx on public.assessment_attempts (status);

create trigger attempts_touch_updated_at
  before update on public.assessment_attempts
  for each row execute function public.touch_updated_at();

create table public.student_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id         uuid not null references public.questions(id) on delete cascade,

  -- A multiple-choice answer is a set, and it is always read and written
  -- whole with the attempt, so it lives in an array rather than a join table.
  selected_option_ids uuid[] not null default '{}',
  text_answer         text check (length(text_answer) <= 5000),

  awarded_points      numeric(6,2),
  graded_by           uuid references public.faculty(id) on delete set null,
  graded_at           timestamptz,
  grader_remarks      text check (length(grader_remarks) <= 1000),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (attempt_id, question_id)
);

create index student_answers_attempt_idx on public.student_answers (attempt_id);

create trigger student_answers_touch_updated_at
  before update on public.student_answers
  for each row execute function public.touch_updated_at();

-- --- Audience resolution ----------------------------------------------------

/**
 * True when a student falls inside an assessment's audience.
 *
 * NULL scope columns mean "any", matching `can_faculty_view_student()`.
 * Keeping the rule in one function is what stops the student's paper list,
 * the staff results view, and the insert policy on attempts from disagreeing
 * about who was supposed to sit a paper.
 */
create or replace function public.assessment_targets_student(
  p_assessment_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessments a
    join public.students s on s.id = p_student_id
    left join public.student_academic_profiles ap on ap.student_id = s.id
    where a.id = p_assessment_id
      and (a.department_code is null or a.department_code = s.department_code)
      and (a.semester is null or a.semester = ap.semester)
      and (a.section is null or a.section = ap.section)
  );
$$;

/** The caller's own student id, or NULL. Saves repeating the join per policy. */
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.students where user_id = auth.uid();
$$;

-- --- Grading guards ---------------------------------------------------------

/**
 * A student may write their answers; they may not write their marks.
 *
 * RLS has to allow UPDATE on the row so answers can be revised before
 * submission, and that same permission would otherwise let a student set
 * `awarded_points` on the way past.
 */
create or replace function public.guard_answer_grading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id    uuid;
  is_reviewer boolean;
begin
  select at.student_id into owner_id
    from public.assessment_attempts at
   where at.id = new.attempt_id;

  is_reviewer := public.is_admin() or public.can_faculty_view_student(owner_id);

  if not is_reviewer then
    if tg_op = 'INSERT' then
      new.awarded_points := null;
      new.graded_by := null;
      new.graded_at := null;
      new.grader_remarks := null;
    else
      if new.awarded_points is distinct from old.awarded_points
         or new.graded_by is distinct from old.graded_by
         or new.graded_at is distinct from old.graded_at
         or new.grader_remarks is distinct from old.grader_remarks then
        raise exception 'Only a mentor or an administrator can grade an answer.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger student_answers_guard_grading
  before insert or update on public.student_answers
  for each row execute function public.guard_answer_grading();

/**
 * The same rule one level up: a student starts and submits their own attempt,
 * but the score on it is not theirs to set, and 'graded' is a verdict rather
 * than something to declare about yourself.
 */
create or replace function public.guard_attempt_scoring()
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
      new.status := 'in_progress';
      new.score := null;
      new.max_score := null;
      new.percentage := null;
      new.passed := null;
      new.graded_at := null;
    else
      if new.score is distinct from old.score
         or new.max_score is distinct from old.max_score
         or new.percentage is distinct from old.percentage
         or new.passed is distinct from old.passed
         or new.graded_at is distinct from old.graded_at then
        raise exception 'Only a mentor or an administrator can score an attempt.';
      end if;

      if new.status is distinct from old.status
         and new.status not in ('submitted', 'abandoned') then
        raise exception 'A student may only submit or abandon their attempt.';
      end if;

      -- Submitting is final. Without this a student could reopen a submitted
      -- attempt, revise it, and submit again inside one allowed attempt.
      if old.status in ('submitted', 'graded') and new.status = 'in_progress' then
        raise exception 'A submitted attempt cannot be reopened.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger attempts_guard_scoring
  before insert or update on public.assessment_attempts
  for each row execute function public.guard_attempt_scoring();

/** Answers freeze once the attempt leaves 'in_progress'. */
create or replace function public.guard_answer_after_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.attempt_status;
  owner_id       uuid;
begin
  select at.status, at.student_id into current_status, owner_id
    from public.assessment_attempts at
   where at.id = coalesce(new.attempt_id, old.attempt_id);

  if current_status <> 'in_progress'
     and not (public.is_admin() or public.can_faculty_view_student(owner_id))
  then
    raise exception 'This attempt has been submitted and can no longer be changed.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger student_answers_freeze_after_submit
  before insert or update or delete on public.student_answers
  for each row execute function public.guard_answer_after_submit();

-- --- Student-facing views ---------------------------------------------------
--
-- `is_correct` is omitted rather than filtered: a student who can read which
-- option is correct does not have an assessment, they have an answer key.
-- `security_invoker` keeps the row policies on the base tables in force
-- through the view — the same load-bearing setting as `student_directory`.

create view public.exam_questions
with (security_invoker = true)
as
select q.id, q.assessment_id, q.kind, q.prompt, q.help_text,
       q.position, q.points, q.required
from public.questions q;

create view public.exam_options
with (security_invoker = true)
as
select o.id, o.question_id, o.label, o.position
from public.question_options o;

grant select on public.exam_questions to authenticated;
grant select on public.exam_options to authenticated;

-- --- RLS --------------------------------------------------------------------

alter table public.assessments         enable row level security;
alter table public.questions           enable row level security;
alter table public.question_options    enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.student_answers     enable row level security;

-- Assessments.
create policy "student reads targeted assessments" on public.assessments
  for select to authenticated
  using (
    is_published
    and public.assessment_targets_student(id, public.current_student_id())
  );

create policy "staff reads own assessments" on public.assessments
  for select to authenticated
  using (created_by = public.current_faculty_id());

create policy "hod reads department assessments" on public.assessments
  for select to authenticated
  using (
    department_code is not null
    and department_code = public.current_hod_department()
  );

create policy "staff writes own assessments" on public.assessments
  for all to authenticated
  using (created_by = public.current_faculty_id())
  with check (created_by = public.current_faculty_id());

create policy "admin reads all assessments" on public.assessments
  for select to authenticated using (public.is_admin());
create policy "admin writes assessments" on public.assessments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Questions and options inherit their assessment's visibility. The bare
-- EXISTS is doing real work: `assessments` is itself RLS-protected, so a row
-- only "exists" here if one of the policies above already let the caller see
-- it.
create policy "read questions of visible assessments" on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.assessments a where a.id = questions.assessment_id
  ));

create policy "author writes questions" on public.questions
  for all to authenticated
  using (exists (
    select 1 from public.assessments a
    where a.id = questions.assessment_id
      and (a.created_by = public.current_faculty_id() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.assessments a
    where a.id = questions.assessment_id
      and (a.created_by = public.current_faculty_id() or public.is_admin())
  ));

create policy "read options of visible questions" on public.question_options
  for select to authenticated
  using (exists (
    select 1 from public.questions q where q.id = question_options.question_id
  ));

create policy "author writes options" on public.question_options
  for all to authenticated
  using (exists (
    select 1 from public.questions q
    join public.assessments a on a.id = q.assessment_id
    where q.id = question_options.question_id
      and (a.created_by = public.current_faculty_id() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.questions q
    join public.assessments a on a.id = q.assessment_id
    where q.id = question_options.question_id
      and (a.created_by = public.current_faculty_id() or public.is_admin())
  ));

-- Attempts.
create policy "student owns own attempts" on public.assessment_attempts
  for select to authenticated
  using (student_id = public.current_student_id());

create policy "student starts own attempt" on public.assessment_attempts
  for insert to authenticated
  with check (
    student_id = public.current_student_id()
    and public.assessment_targets_student(assessment_id, public.current_student_id())
  );

create policy "student updates own attempt" on public.assessment_attempts
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

-- Psychometric attempts are narrower than everything else in this portal:
-- the student and their assigned mentor, nobody else (PRD 5.7).
create policy "staff reads attempts of visible students" on public.assessment_attempts
  for select to authenticated
  using (
    public.can_faculty_view_student(student_id)
    and (
      not exists (
        select 1 from public.assessments a
        where a.id = assessment_attempts.assessment_id
          and a.kind = 'psychometric'
      )
      or public.is_assigned_mentor(student_id)
    )
  );

create policy "staff grades attempts of visible students" on public.assessment_attempts
  for update to authenticated
  using (public.can_faculty_view_student(student_id))
  with check (public.can_faculty_view_student(student_id));

create policy "admin reads all attempts" on public.assessment_attempts
  for select to authenticated using (public.is_admin());
create policy "admin writes attempts" on public.assessment_attempts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Answers follow their attempt.
create policy "student reads own answers" on public.student_answers
  for select to authenticated
  using (exists (
    select 1 from public.assessment_attempts at
    where at.id = student_answers.attempt_id
      and at.student_id = public.current_student_id()
  ));

create policy "student writes own answers" on public.student_answers
  for all to authenticated
  using (exists (
    select 1 from public.assessment_attempts at
    where at.id = student_answers.attempt_id
      and at.student_id = public.current_student_id()
  ))
  with check (exists (
    select 1 from public.assessment_attempts at
    where at.id = student_answers.attempt_id
      and at.student_id = public.current_student_id()
  ));

create policy "staff reads answers of visible students" on public.student_answers
  for select to authenticated
  using (exists (
    select 1 from public.assessment_attempts at
    join public.assessments a on a.id = at.assessment_id
    where at.id = student_answers.attempt_id
      and public.can_faculty_view_student(at.student_id)
      and (a.kind <> 'psychometric' or public.is_assigned_mentor(at.student_id))
  ));

create policy "staff grades answers of visible students" on public.student_answers
  for update to authenticated
  using (exists (
    select 1 from public.assessment_attempts at
    where at.id = student_answers.attempt_id
      and public.can_faculty_view_student(at.student_id)
  ))
  with check (exists (
    select 1 from public.assessment_attempts at
    where at.id = student_answers.attempt_id
      and public.can_faculty_view_student(at.student_id)
  ));

create policy "admin reads all answers" on public.student_answers
  for select to authenticated using (public.is_admin());
create policy "admin writes answers" on public.student_answers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
