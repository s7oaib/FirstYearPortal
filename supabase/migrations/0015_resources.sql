-- ===========================================================================
-- 0015_resources.sql — VTU resources and certification recommendations
--                      (PRD 5.9)
--
-- Admin-curated links to syllabus documents, NPTEL/SWAYAM courses, and vendor
-- certifications, plus the tags that let the portal say *why* a given
-- resource was recommended to a given student.
--
-- The governing requirement here is honesty, and it is worth being explicit
-- about how the schema enforces it rather than hoping the UI remembers:
--
--   * `is_verified` defaults to false and a trigger stops anyone but an
--     administrator setting it. A resource nobody has checked is therefore
--     *structurally* unverified, not merely unlabelled, and the student-facing
--     view carries the flag so it cannot be dropped on the way to the screen.
--
--   * This migration seeds no rows. Every other reference table in this schema
--     ships with sensible defaults; this one deliberately does not, because a
--     plausible-looking URL that nobody has opened is exactly the fabricated
--     metadata PRD 5.9 rules out. An empty list is honest; an invented one is
--     not, and is far harder to discover later.
-- ===========================================================================

create type public.resource_kind as enum (
  'syllabus', 'scheme', 'question_paper', 'course',
  'certification', 'book', 'video', 'tool', 'other'
);

create table public.resources (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(trim(title)) between 3 and 200),
  description     text check (length(description) <= 2000),
  kind            public.resource_kind not null default 'course',

  -- The provider as a plain string (NPTEL, SWAYAM, VTU, Coursera, …). A
  -- lookup table would imply the portal knows the full set, which it does
  -- not, and would make adding one an admin migration rather than typing.
  provider        text check (length(provider) <= 120),

  url             text not null check (url ~* '^https?://'),

  -- Optional scoping. NULL means "relevant to everyone", the same convention
  -- every other scoped table here uses.
  department_code text references public.departments(code),
  semester        smallint check (semester between 1 and 2),

  -- Rough effort, shown so a student can tell a weekend course from a term.
  estimated_hours integer check (estimated_hours between 0 and 2000),
  is_free         boolean,

  -- Verification. False until an administrator says otherwise, enforced by
  -- the trigger below rather than by whoever writes the form.
  is_verified     boolean not null default false,
  verified_by     uuid references public.admins(id) on delete set null,
  verified_at     timestamptz,

  added_by        uuid references public.users(id) on delete set null,
  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The same link twice under two titles is a curation failure, not a
  -- feature.
  unique (url)
);

create index resources_kind_idx on public.resources (kind);
create index resources_department_idx on public.resources (department_code);
create index resources_verified_idx on public.resources (is_verified, is_active);

create trigger resources_touch_updated_at
  before update on public.resources
  for each row execute function public.touch_updated_at();

-- --- Tags -------------------------------------------------------------------
--
-- What a resource is *about*, expressed in the same vocabulary students used
-- to describe themselves at registration. Reusing `interests`, `career_goals`,
-- and `technical_domains` rather than inventing a parallel taxonomy is what
-- makes "recommended because you said you are interested in X" a fact the
-- database can support, instead of a sentence the UI makes up.

create table public.resource_interests (
  resource_id uuid not null references public.resources(id) on delete cascade,
  interest_id integer not null references public.interests(id) on delete cascade,
  primary key (resource_id, interest_id)
);

create table public.resource_goals (
  resource_id uuid not null references public.resources(id) on delete cascade,
  goal_id     integer not null references public.career_goals(id) on delete cascade,
  primary key (resource_id, goal_id)
);

create table public.resource_domains (
  resource_id uuid not null references public.resources(id) on delete cascade,
  domain_id   integer not null references public.technical_domains(id) on delete cascade,
  primary key (resource_id, domain_id)
);

create index resource_interests_interest_idx on public.resource_interests (interest_id);
create index resource_goals_goal_idx on public.resource_goals (goal_id);
create index resource_domains_domain_idx on public.resource_domains (domain_id);

-- --- Saved resources --------------------------------------------------------

create table public.student_resources (
  student_id  uuid not null references public.students(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (student_id, resource_id)
);

create index student_resources_student_idx on public.student_resources (student_id);

-- --- Verification guard -----------------------------------------------------

/**
 * Only an administrator may mark a resource verified.
 *
 * Faculty can suggest resources — that is the point of letting them write —
 * but "an administrator has checked this link" is a claim only an
 * administrator can make. Without this, the verified badge would mean
 * "somebody ticked a box", which is worth nothing to the student reading it.
 */
create or replace function public.guard_resource_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := false;
    new.verified_by := null;
    new.verified_at := null;
  elsif new.is_verified is distinct from old.is_verified
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    raise exception 'Only an administrator can verify a resource.';
  end if;

  return new;
end;
$$;

create trigger resources_guard_verification
  before insert or update on public.resources
  for each row execute function public.guard_resource_verification();

-- --- RLS --------------------------------------------------------------------

alter table public.resources          enable row level security;
alter table public.resource_interests enable row level security;
alter table public.resource_goals     enable row level security;
alter table public.resource_domains   enable row level security;
alter table public.student_resources  enable row level security;

-- Every signed-in user can read the active catalogue, verified or not. The
-- flag travels with the row so an unverified entry can be shown *and*
-- labelled, which is what PRD 5.9 asks for — hiding it would leave a student
-- unable to see something a faculty member deliberately suggested.
create policy "read active resources" on public.resources
  for select to authenticated using (is_active);

create policy "staff suggests resources" on public.resources
  for insert to authenticated
  with check (public.current_faculty_id() is not null or public.is_admin());

create policy "staff edits own suggestions" on public.resources
  for update to authenticated
  using (added_by = auth.uid()) with check (added_by = auth.uid());

create policy "admin writes resources" on public.resources
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tags are readable with the resource and writable by whoever may write it.
create policy "read resource interests" on public.resource_interests
  for select to authenticated using (true);
create policy "write resource interests" on public.resource_interests
  for all to authenticated
  using (exists (
    select 1 from public.resources r
    where r.id = resource_interests.resource_id
      and (r.added_by = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.resources r
    where r.id = resource_interests.resource_id
      and (r.added_by = auth.uid() or public.is_admin())
  ));

create policy "read resource goals" on public.resource_goals
  for select to authenticated using (true);
create policy "write resource goals" on public.resource_goals
  for all to authenticated
  using (exists (
    select 1 from public.resources r
    where r.id = resource_goals.resource_id
      and (r.added_by = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.resources r
    where r.id = resource_goals.resource_id
      and (r.added_by = auth.uid() or public.is_admin())
  ));

create policy "read resource domains" on public.resource_domains
  for select to authenticated using (true);
create policy "write resource domains" on public.resource_domains
  for all to authenticated
  using (exists (
    select 1 from public.resources r
    where r.id = resource_domains.resource_id
      and (r.added_by = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.resources r
    where r.id = resource_domains.resource_id
      and (r.added_by = auth.uid() or public.is_admin())
  ));

-- A student's saved list is their own. Staff deliberately cannot read it:
-- what a student bookmarks is not performance data, and making it visible
-- would change what they feel able to save.
create policy "student manages own saved resources" on public.student_resources
  for all to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());
