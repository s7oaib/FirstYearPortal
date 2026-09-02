-- ===========================================================================
-- 0017_notifications.sql — in-app notifications (PRD 5.11)
--
-- Notifications are written by database triggers, not by the application.
--
-- That is the whole design decision, and it is worth stating why. Every event
-- worth telling someone about — an achievement verified, a roadmap approved,
-- an attempt marked, a waiting-list place opening — already happens through a
-- write to a table that has its own guards. Raising the notification from the
-- application would mean every one of those paths remembering to, and a path
-- that forgets fails silently: nobody complains about a message they never
-- knew was coming. Attaching it to the row change makes it structural.
--
-- Consequently `notifications` has no INSERT policy at all. A session cannot
-- forge a notification, and cannot suppress one about itself — the same
-- posture `audit_logs` takes, and for the same reason.
-- ===========================================================================

create type public.notification_kind as enum (
  'account_approved',
  'profile_incomplete',
  'achievement_verified',
  'achievement_rejected',
  'assessment_graded',
  'event_seat_confirmed',
  'roadmap_approved',
  'roadmap_returned'
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),

  -- Addressed to an auth identity rather than a student or faculty row, so
  -- one inbox serves an account whatever roles it holds.
  user_id     uuid not null references auth.users(id) on delete cascade,

  kind        public.notification_kind not null,
  title       text not null check (length(trim(title)) between 3 and 200),
  body        text check (length(body) <= 1000),

  -- Where to go. Stored as an in-app path; never an external URL, so a
  -- notification cannot be turned into a way to send someone off-site.
  link        text check (link is null or link ~ '^/'),

  entity_type text,
  entity_id   text,

  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, read_at, created_at desc);

-- --- Raising a notification -------------------------------------------------

/**
 * Writes one notification. SECURITY DEFINER so the triggers below can insert
 * despite there being no INSERT policy for anyone.
 */
create or replace function public.notify_user(
  p_user_id uuid,
  p_kind public.notification_kind,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_entity_type text default null,
  p_entity_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications
    (user_id, kind, title, body, link, entity_type, entity_id)
  values
    (p_user_id, p_kind, p_title, p_body, p_link, p_entity_type, p_entity_id);
end;
$$;

/** The auth identity behind a student row. */
create or replace function public.user_id_for_student(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.students where id = p_student_id;
$$;

-- --- Triggers ---------------------------------------------------------------

create or replace function public.notify_achievement_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status = old.verification_status then
    return new;
  end if;

  if new.verification_status = 'verified' then
    perform public.notify_user(
      public.user_id_for_student(new.student_id),
      'achievement_verified',
      'Achievement verified',
      format('%s has been confirmed by your mentor.', new.title),
      '/achievements', 'achievements', new.id::text
    );
  elsif new.verification_status = 'rejected' then
    perform public.notify_user(
      public.user_id_for_student(new.student_id),
      'achievement_rejected',
      'Achievement not verified',
      coalesce(
        new.remarks,
        format('Your mentor could not verify %s.', new.title)
      ),
      '/achievements', 'achievements', new.id::text
    );
  end if;

  return new;
end;
$$;

create trigger achievements_notify_decision
  after update on public.achievements
  for each row execute function public.notify_achievement_decision();

create or replace function public.notify_attempt_graded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'graded' or old.status = 'graded' then
    return new;
  end if;

  perform public.notify_user(
    public.user_id_for_student(new.student_id),
    'assessment_graded',
    'Your assessment has been marked',
    case
      when new.percentage is null then 'Your result is ready.'
      else format('You scored %s%%.', new.percentage)
    end,
    '/assessments', 'assessment_attempts', new.id::text
  );

  return new;
end;
$$;

create trigger attempts_notify_graded
  after update on public.assessment_attempts
  for each row execute function public.notify_attempt_graded();

-- A waiting-list place opening up is the one event here a student cannot
-- discover by looking — it happens because somebody else cancelled.
create or replace function public.notify_seat_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_title text;
begin
  if new.status <> 'registered' or old.status <> 'waitlisted' then
    return new;
  end if;

  select title into event_title from public.events where id = new.event_id;

  perform public.notify_user(
    public.user_id_for_student(new.student_id),
    'event_seat_confirmed',
    'A place has opened up',
    format('You are now registered for %s.', coalesce(event_title, 'an event')),
    '/events', 'event_registrations', new.id::text
  );

  return new;
end;
$$;

create trigger registrations_notify_seat
  after update on public.event_registrations
  for each row execute function public.notify_seat_confirmed();

create or replace function public.notify_roadmap_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status = old.approval_status then
    return new;
  end if;

  if new.approval_status = 'approved' then
    perform public.notify_user(
      public.user_id_for_student(new.student_id),
      'roadmap_approved',
      'Your development roadmap is ready',
      'Your mentor has reviewed and approved it.',
      '/roadmap', 'student_roadmaps', new.id::text
    );
  end if;

  -- 'rejected' deliberately raises nothing for the student. A plan sent back
  -- to be redone is a conversation between mentors, not a rejection to
  -- deliver to a first-year student who never saw the plan in the first
  -- place.

  return new;
end;
$$;

create trigger roadmaps_notify_decision
  after update on public.student_roadmaps
  for each row execute function public.notify_roadmap_decision();

create or replace function public.notify_account_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and old.status <> 'active' then
    perform public.notify_user(
      new.id,
      'account_approved',
      'Your account has been approved',
      'You can now use the portal.',
      '/', 'users', new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger users_notify_approved
  after update on public.users
  for each row execute function public.notify_account_approved();

-- --- Read state -------------------------------------------------------------

/**
 * A recipient may mark a notification read; they may not rewrite it.
 *
 * The UPDATE policy has to allow the row so `read_at` can move, and that same
 * permission would otherwise let someone edit the title of a message about
 * themselves.
 */
create or replace function public.guard_notification_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.link is distinct from old.link
     or new.created_at is distinct from old.created_at then
    raise exception 'A notification''s content cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger notifications_guard_content
  before update on public.notifications
  for each row execute function public.guard_notification_content();

-- --- RLS --------------------------------------------------------------------

alter table public.notifications enable row level security;

-- Read and mark-as-read, own only. No INSERT policy anywhere, deliberately:
-- notifications come from the triggers above, so a session cannot forge one
-- or suppress one about itself.
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy "mark own notifications read" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- --- Live updates -----------------------------------------------------------
--
-- PRD 5.11 asks for real-time rather than polling. Adding the table to the
-- realtime publication is what lets a client subscribe; RLS still applies to
-- the stream, so a subscriber only ever receives their own rows.
--
-- Guarded because the publication does not exist on every Postgres install,
-- and a missing publication should not fail the whole migration.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when duplicate_object then null;
end $$;
