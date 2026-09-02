-- ===========================================================================
-- 0014_events.sql — events, registration, and attendance (PRD 5.8)
--
-- Faculty and heads of department publish events to an audience; students
-- register, cancel, and later see what they attended.
--
-- The interesting problem here is capacity. "Don't let more than N students
-- register" cannot be an RLS policy, because a policy decides on one row in
-- isolation and capacity is a fact about all of them. Two students clicking
-- register at the same moment would both pass an application-level count and
-- both be admitted. So the check lives in a trigger that locks the event row
-- first — the lock is what makes the count trustworthy, and it is why this
-- cannot be solved by counting in TypeScript.
--
-- Registration is soft-deleted rather than removed on cancellation. An event
-- roster is a record of who was expected, and a student who cancels the day
-- before is a different fact from one who never signed up — the difference
-- matters when nobody turns up and someone asks why.
-- ===========================================================================

create type public.event_kind as enum (
  'workshop', 'seminar', 'competition', 'training',
  'placement_drive', 'cultural', 'sports', 'other'
);

create type public.registration_status as enum (
  'registered', 'waitlisted', 'cancelled'
);

-- --- Events -----------------------------------------------------------------

create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null check (length(trim(title)) between 3 and 200),
  description           text check (length(description) <= 4000),
  kind                  public.event_kind not null default 'workshop',
  venue                 text check (length(venue) <= 200),

  created_by            uuid references public.faculty(id) on delete set null,

  -- Audience, NULL meaning "any" — the convention every scope table in this
  -- schema already uses.
  department_code       text references public.departments(code),
  semester              smallint check (semester between 1 and 2),
  section               text,

  starts_at             timestamptz not null,
  ends_at               timestamptz,
  registration_deadline timestamptz,

  -- NULL means uncapped. Zero would mean "nobody may attend", which is a
  -- different and rarely intended thing, so the two are kept distinct.
  capacity              integer check (capacity is null or capacity > 0),

  -- Students beyond capacity join a waiting list instead of being refused.
  allow_waitlist        boolean not null default true,

  is_published          boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint ends_after_starts check (ends_at is null or ends_at > starts_at),
  constraint deadline_before_start check (
    registration_deadline is null or registration_deadline <= starts_at
  )
);

create index events_scope_idx on public.events (department_code, semester, section);
create index events_published_idx on public.events (is_published);
create index events_starts_idx on public.events (starts_at);

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- --- Registrations ----------------------------------------------------------

create table public.event_registrations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  status         public.registration_status not null default 'registered',
  registered_at  timestamptz not null default now(),
  cancelled_at   timestamptz,

  -- Attendance, recorded by staff after the event.
  attended       boolean,
  marked_by      uuid references public.faculty(id) on delete set null,
  marked_at      timestamptz,

  -- Feedback, from the student afterwards.
  feedback_rating  smallint check (feedback_rating between 1 and 5),
  feedback_comment text check (length(feedback_comment) <= 1000),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One row per student per event. Cancelling flips the status rather than
  -- deleting, so re-registering reuses this row and the history survives.
  unique (event_id, student_id)
);

create index event_registrations_event_idx
  on public.event_registrations (event_id, status);
create index event_registrations_student_idx
  on public.event_registrations (student_id);

create trigger event_registrations_touch_updated_at
  before update on public.event_registrations
  for each row execute function public.touch_updated_at();

-- --- Audience resolution ----------------------------------------------------

create or replace function public.event_targets_student(
  p_event_id uuid,
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
    from public.events e
    join public.students s on s.id = p_student_id
    left join public.student_academic_profiles ap on ap.student_id = s.id
    where e.id = p_event_id
      and (e.department_code is null or e.department_code = s.department_code)
      and (e.semester is null or e.semester = ap.semester)
      and (e.section is null or e.section = ap.section)
  );
$$;

-- --- Capacity ---------------------------------------------------------------

/**
 * Enforces capacity, and decides between a seat and the waiting list.
 *
 * The `select ... for update` on the event row is the load-bearing line. Two
 * students registering in the same instant would otherwise both count the
 * seats, both see one free, and both take it. Locking the event first makes
 * the second transaction wait until the first has committed its row, so the
 * count it reads is true. This is exactly the check that cannot be done
 * correctly in application code.
 *
 * Staff and administrators are exempt: adding someone to a full event is a
 * deliberate act, and refusing it would leave no way to admit a student who
 * turned up with permission.
 */
create or replace function public.assign_event_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row  public.events%rowtype;
  taken      integer;
  is_staff   boolean;
begin
  -- Only registering (or re-registering) competes for a seat.
  if new.status <> 'registered' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'registered' then
    return new;
  end if;

  select * into event_row from public.events where id = new.event_id for update;

  if not found then
    raise exception 'That event no longer exists.';
  end if;

  is_staff := public.is_admin() or public.can_faculty_view_student(new.student_id);

  if not is_staff then
    if not event_row.is_published then
      raise exception 'That event is not open for registration.';
    end if;

    if event_row.registration_deadline is not null
       and now() > event_row.registration_deadline then
      raise exception 'Registration for that event has closed.';
    end if;

    if event_row.starts_at <= now() then
      raise exception 'That event has already started.';
    end if;
  end if;

  if event_row.capacity is not null then
    select count(*) into taken
      from public.event_registrations r
     where r.event_id = new.event_id
       and r.status = 'registered'
       and r.id is distinct from new.id;

    if taken >= event_row.capacity then
      if event_row.allow_waitlist then
        new.status := 'waitlisted';
      else
        raise exception 'That event is full.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger event_registrations_assign_seat
  before insert or update on public.event_registrations
  for each row execute function public.assign_event_seat();

/**
 * A student records their own registration and feedback; attendance is
 * somebody else's judgement about them, so it is pinned the same way
 * achievement verification and assessment marks are.
 */
create or replace function public.guard_event_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_reviewer boolean;
begin
  is_reviewer := public.is_admin()
                 or public.can_faculty_view_student(new.student_id);

  if not is_reviewer then
    if tg_op = 'INSERT' then
      new.attended := null;
      new.marked_by := null;
      new.marked_at := null;
    elsif new.attended is distinct from old.attended
       or new.marked_by is distinct from old.marked_by
       or new.marked_at is distinct from old.marked_at then
      raise exception 'Only staff can record attendance.';
    end if;
  end if;

  return new;
end;
$$;

create trigger event_registrations_guard_attendance
  before insert or update on public.event_registrations
  for each row execute function public.guard_event_attendance();

/**
 * Promotes the first waitlisted student when a seat frees up.
 *
 * Runs after a cancellation rather than on a schedule, so a place that opens
 * is filled immediately instead of at the next time somebody happens to look.
 * Oldest registration first, which is the only ordering a student would
 * accept as fair.
 */
create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.events%rowtype;
  taken     integer;
  next_id   uuid;
begin
  if new.status <> 'cancelled' or old.status <> 'registered' then
    return new;
  end if;

  select * into event_row from public.events where id = new.event_id for update;
  if not found or event_row.capacity is null then
    return new;
  end if;

  select count(*) into taken
    from public.event_registrations r
   where r.event_id = new.event_id and r.status = 'registered';

  if taken >= event_row.capacity then
    return new;
  end if;

  select r.id into next_id
    from public.event_registrations r
   where r.event_id = new.event_id and r.status = 'waitlisted'
   order by r.registered_at asc
   limit 1;

  if next_id is not null then
    -- Updated directly rather than through the seat trigger, which would see
    -- a full event and put them straight back on the list.
    update public.event_registrations
       set status = 'registered'
     where id = next_id;
  end if;

  return new;
end;
$$;

create trigger event_registrations_promote_waitlist
  after update on public.event_registrations
  for each row execute function public.promote_from_waitlist();

-- --- RLS --------------------------------------------------------------------

alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;

create policy "student reads targeted events" on public.events
  for select to authenticated
  using (
    is_published
    and public.event_targets_student(id, public.current_student_id())
  );

create policy "staff reads own events" on public.events
  for select to authenticated
  using (created_by = public.current_faculty_id());

create policy "hod reads department events" on public.events
  for select to authenticated
  using (
    department_code is not null
    and department_code = public.current_hod_department()
  );

create policy "staff writes own events" on public.events
  for all to authenticated
  using (created_by = public.current_faculty_id())
  with check (created_by = public.current_faculty_id());

create policy "admin reads all events" on public.events
  for select to authenticated using (public.is_admin());
create policy "admin writes events" on public.events
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Registrations.
create policy "student reads own registrations" on public.event_registrations
  for select to authenticated
  using (student_id = public.current_student_id());

create policy "student registers self" on public.event_registrations
  for insert to authenticated
  with check (
    student_id = public.current_student_id()
    and public.event_targets_student(event_id, public.current_student_id())
  );

create policy "student updates own registration" on public.event_registrations
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

create policy "staff reads registrations of visible students"
  on public.event_registrations
  for select to authenticated
  using (public.can_faculty_view_student(student_id));

create policy "staff marks attendance" on public.event_registrations
  for update to authenticated
  using (public.can_faculty_view_student(student_id))
  with check (public.can_faculty_view_student(student_id));

create policy "admin reads all registrations" on public.event_registrations
  for select to authenticated using (public.is_admin());
create policy "admin writes registrations" on public.event_registrations
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
