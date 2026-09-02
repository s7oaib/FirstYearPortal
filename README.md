# First-Year Student Development and Analytics Portal

A role-based web portal that gives HKBK College of Engineering a single,
structured record of every first-year student — and turns it into filterable
analytics for faculty and administrators.

Built with Next.js 14 and Supabase, with access boundaries enforced at three
independent layers.

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)
![Tests](https://img.shields.io/badge/tests-181%20passing-brightgreen)

---

## The problem

Academic background, interests, career goals, and mentoring activity for
first-year students were spread across paper forms and spreadsheets. Faculty
could not quickly find the students who needed support, and the institution
could not report on outcomes without manual collation.

This portal collects a complete structured profile from every student once,
then makes that data queryable — under strict role boundaries. A student can
never see another student's record. A faculty member sees only the students
assigned to them; a head of department sees their department; an administrator
sees the institution. Guardian contact details reach only the people who
actually need them: a student's assigned mentor, their head of department, and
administrators.

## Features

### Student

- Three-step registration with live validation (USN format, unique
  email/phone/username, password strength, recorded consent)
- Mandatory profile gate — the dashboard stays locked until academic
  background, interests, career goals, and technical domains are all saved
- Section-by-section saving, so an interrupted session loses nothing
- Live completion percentage with a milestone breakdown of what remains
- Dashboard: academic summary, residence, interests, goals, domains, contact

### Faculty

- Dashboard scoped to assigned students: counts, completion rate, and
  distributions by department, semester, quota, and residence type
- Student directory with eleven combinable filters, search, and pagination
- Filter state lives in the URL, so any view is linkable and shareable
- Charts summarising the whole filtered set, not just the visible page
- Full authorised profile for any assigned student
- CSV export carrying a provenance header — who exported, when, and which
  filters produced the file
- Students flagged for follow-up, least-complete profile first
- Achievement verification queue

### Head of Department

- A separate sign-in entrance at `/login/hod` that accepts only HOD accounts
- Every student in their department, with no assignment rows needed — the
  scope comes from `can_faculty_view_student()`, the same function every other
  faculty policy already used
- The same directory, filters, charts, CSV export, and profile view faculty
  get, over the department rather than an assignment list
- Guardian contact for their department, because a head of department is who
  actually has to ring a guardian
- Achievement verification for the whole department

### Administrator

- Institution-wide analytics and a side-by-side department comparison
- The full student directory with the same filters, charts, and CSV export
- Account approval queue for every role
- Role management — promote an approved faculty account to Head of Department
- Faculty assignment management — by department/semester/section scope or by
  named student, with a separate mentor flag
- Department management, without a deploy
- Append-only audit log of every privileged action
- Institution CSV report

The `admin` role is restricted to an allow-list held in the database
(`public.admin_allowlist`). It is the one role with institution-wide reach,
and until migration 0011 anything could reach it — `handle_new_auth_user`
takes the role straight from signup metadata, so a stranger could register
asking for `role: 'admin'` and sit in the approvals queue looking like a
legitimate request. A trigger now refuses the write outright, on both
`users.role` and the `user_roles` table.

### One account, several roles

Roles are a set, not a single value (migration 0012). The real structure of
the institution needs it: the head of AIML is also a portal administrator, and
the portal administrator also teaches. Before this each of them could reach
only one of their two portals.

`users.role` survives as the **primary** role — it decides where the account
lands after sign-in and how it is labelled in the approvals queue — while
`public.user_roles` holds the full set that decides what may be reached. A
trigger keeps the primary role present in the set, so nothing has to consult
two sources to answer "may this account do X".

Accounts holding more than one role get a **Your portals** switcher in the
sidebar. Rendering that link grants nothing: middleware re-checks the role set
on every request and RLS re-checks it in the database, so a hand-typed URL to
an area the account does not hold is refused exactly as before.

## Security model

Three independent layers, each able to deny access on its own. No layer is
trusted alone.

| Layer | Where | Enforces |
|---|---|---|
| **1. Middleware** | [`src/middleware.ts`](src/middleware.ts) | Session exists; `role`/`status` read live from the database, not the JWT, so a suspension takes effect on the next request; cross-role access redirected; incomplete student profiles sent back to the gate, on every student route rather than only `/dashboard` |
| **2. Server Actions** | [`src/lib/actions/`](src/lib/actions/) | Every mutation re-derives the caller's identity from their session. A client may post any id it likes and still writes only its own row |
| **3. Postgres RLS** | [`supabase/migrations/`](supabase/migrations/) | Policies key off `auth.uid()`. All staff visibility — mentor, head of department — resolves through a single `can_faculty_view_student()` function reused by every policy, so adding the HOD role widened one function rather than touching a dozen policies |

Additional measures:

- **The `admin` role is allow-list-only.** A trigger on `public.users` refuses
  any write that sets `role = 'admin'` for an address not in
  `public.admin_allowlist`, which has no INSERT policy — so no signed-in
  session, administrator or otherwise, can widen it from inside the
  application. This closes the path where signup metadata (`role: 'admin'`)
  decided the requested role.
- **Role-specific sign-in entrances are enforced server-side.** `/login/hod`
  posts the role it serves as a hidden field; the login action reads the real
  role back from `users` and compares it there. A mismatch ends the session
  rather than redirecting, so a refused visitor is not left holding valid
  credentials.
- **Column-level guardian masking.** RLS controls which *rows* are visible but
  cannot mask a column. A `security_invoker` view resolves guardian contact to
  `NULL` unless the caller is the assigned mentor or an administrator — so the
  CSV export cannot leak what the screen hides.
- **Audit entries are written with the service role**, which no browser
  session holds. An action cannot be performed without leaving a record.
- **Immutable columns.** A trigger pins `users.id` and constrains
  `users.email` to match the auth identity.
- **CSV injection defence.** Cells beginning `=`, `+`, `-`, or `@` are escaped
  before export.
- **No account enumeration.** Login and password-reset responses do not reveal
  whether an address is registered.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript, React 18 |
| Styling | Tailwind CSS with a custom indigo/brass token set |
| Backend | Next.js Server Actions and Server Components |
| Database | PostgreSQL via Supabase, with Row Level Security |
| Auth | Supabase Auth (email/password) |
| Validation | Zod schemas shared between client and server |
| Testing | Vitest |

## Getting started

### Prerequisites

- Node.js 20 or newer
- A Supabase project (the free tier is sufficient)

### 1. Install

```bash
git clone https://github.com/AfreenKubra/FirstYearPortal.git
cd FirstYearPortal
npm install
```

### 2. Apply the database migrations

In the Supabase dashboard, open **SQL Editor** and run each file in
[`supabase/migrations/`](supabase/migrations/) in order:

| Migration | Adds |
|---|---|
| `0001_init_mvp.sql` | Core schema, enums, signup trigger, student RLS, seed reference data |
| `0002_public_reference_read.sql` | Lets the unauthenticated registration page read departments and languages |
| `0003_faculty.sql` | Faculty records, assignment scoping, faculty RLS, guardian-masking view |
| `0004_admin.sql` | Admin records, admin write policies, immutable-column guard |
| `0005_staff_registration.sql` | Lets a pending administrator create their own profile row |
| `0006_email_sync.sql` | Keeps `users.email` in step with Supabase Auth |
| `0007_residence_type.sql` | Replaces the two-value accommodation field with four residence types |
| `0008_approve_all_registrations.sql` | Every new account starts `pending`, students included |
| `0009_achievements.sql` | Achievements, evidence documents, verification guards, private storage bucket |
| `0010_hod_role_enum.sql` | Adds `hod` to the `user_role` enum — **on its own, nothing else** |
| `0011_hod_scope_and_admin_allowlist.sql` | HOD department scope, administrator allow-list and its guard trigger |
| `0012_multiple_roles.sql` | `user_roles` join table, so one account can hold several roles |
| `0013_assessments.sql` | Assessment engine: question bank, attempts, answers, grading guards |
| `0014_events.sql` | Events, registration with capacity and waiting list, attendance |

**0010 and 0011 must be run as two separate statements.** PostgreSQL will not
let one transaction add an enum value and then use it, and both the SQL Editor
and the migration runner wrap each file in a transaction. Running them
together fails with `unsafe use of new value of enum type`.

Once `DATABASE_URL` is configured (below), later migrations can instead be
applied with:

```bash
npm run migrate        # apply anything pending
npm run migrate:dry    # list what would run, change nothing
```

To find out what the live database is actually missing:

```bash
npm run check:schema
```

This probes for the objects each migration creates rather than reading
`schema_migrations`, so it gives a true answer even when migrations were
pasted into the SQL Editor by hand. It exists because the app is written to
degrade quietly when a migration is missing — queries return empty results
rather than throwing — which is right in production and unhelpful during
setup, where "the achievements page is empty" and "the achievements table does
not exist" look identical from the browser.

### 3. Disable email confirmation

**Authentication → Sign In / Providers → Email → uncheck "Confirm email".**

Registration writes the student record using the session that `signUp`
returns. With confirmation enabled there is no session at that moment, so the
profile cannot be created. Enforcing verification properly is planned work.

### 4. Configure environment

```bash
cp .env.example .env.local
```

| Variable | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API | Public by design — every query it makes is RLS-constrained |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API | **Server-only.** Bypasses RLS. Never prefix with `NEXT_PUBLIC_` |
| `DATABASE_URL` | Settings → Database | Optional; only needed for `npm run migrate` |

`.env.local` is gitignored. Never commit real credentials.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

### 6. Administrators

Administrator accounts are not self-service and cannot be requested through
the portal. Migration 0011 seeds `public.admin_allowlist` with the approved
addresses and promotes any matching account that already exists, so after
running it the listed administrators can simply sign in.

To approve a different address, add it to the allow-list **and** to
`ADMIN_ALLOWLIST` in [`src/config/roles.ts`](src/config/roles.ts). The table
has no INSERT policy, so this is a service-role operation — run it in the SQL
Editor, not from the application:

```sql
insert into public.admin_allowlist (email, note)
values ('new-admin@hkbk.edu.in', 'Why this person')
on conflict (email) do nothing;
```

Then set their role under **Account approvals**. The database trigger refuses
the role change until the address is on the list, so the two cannot drift out
of step silently.

`npm run sync:admins` does the same reconciliation from the command line —
promoting every allow-listed account that exists, and suspending any
administrator who is not on the list. It is data-only and idempotent, so it
works before migration 0011 has been applied and is safe to re-run:

```bash
npm run sync:admins -- --dry     # show what would change
npm run sync:admins
```

### 7. Create a Head of Department

1. Register at `/register/staff`, choose **Head of Department**, and pick the
   department.
2. An administrator accepts the account under **Account approvals**.
3. On the same screen, set the account's role to **Head of Department**.

They then sign in at `/login/hod` and see their whole department — no
assignment rows required.

### 8. Bulk-create student accounts

```bash
npm run seed:students:dry                        # show what would be created
npm run seed:students                            # 1HK24AI001–015, AIML
npm run seed:students -- --from 1 --to 60
npm run seed:students -- --dept CSE --prefix 1HK24CS
npm run seed:students -- --passwordSuffix '@hkbk2026'
npm run seed:students -- --reset-passwords       # re-apply to existing accounts
```

Each student gets their own USN as their password: `1HK24AI001` signs in as
`1hk24ai001@hkbk.edu.in` with `1hk24ai001@hkbk`. Per-student rather than one
shared secret — a single cohort-wide password is one leak away from every
account, and it cannot be rotated for one student without rotating it for all
of them.

Creating a student means creating an auth identity, which SQL cannot do —
`auth.users` rows carry hashed credentials only Supabase Auth may write — so
this runs against the Admin API with the service-role key. Accounts are
created pre-confirmed and active, since an account an administrator just made
by hand does not also need that administrator to approve it. Re-running is
safe: an existing USN or email is reported and skipped, unless
`--reset-passwords` is passed, which is the one flag that deliberately
changes an existing account.

These are handout credentials, not secrets. The password is derivable from the
USN, so anyone who knows a student's registration number knows their password
until they change it — tell students to change it on first sign-in. Each still
has to complete their own profile before the dashboard unlocks.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run migrate` | Apply pending database migrations |
| `npm run check:schema` | Report which migrations the live database is missing |
| `npm run sync:admins` | Reconcile who holds the `admin` role against the allow-list |
| `npm run seed:students` | Bulk-create student accounts |

## Project structure

```
src/
  app/
    (public)/          landing, login, HOD login, register, staff register, reset, privacy
    (student)/         dashboard, complete-profile, achievements
    (faculty)/         dashboard, student directory, detail, export, verification queue
    (hod)/             the same, scoped to one department
    (admin)/           overview, students, approvals, assignments, departments, audit, export
    auth/callback/     Supabase email-link exchange
  components/
    ui/                Button, Field, Card, ProgressBar, Logo, FormStatus
    layout/            AuthShell, role navigation
    registration/      student and staff registration forms
    directory/         filters, table, charts, profile, dashboards — shared by all three staff roles
    achievements/      achievement card, form, verification form
    admin/             approval, role, department, and assignment forms
  lib/
    supabase/          browser, server, and service-role clients; hand-written types
    validation/        Zod schemas shared client and server
    actions/           Server Actions (all mutations)
    queries/           directory (shared), student, faculty, admin, achievements
    directory/         CSV export builder
    faculty/           filter parsing and CSV helpers
    admin/             analytics aggregation
    profile-completion.ts   pure, unit-tested completion logic
  config/              branding, roles, departments, residence types, achievements, states
  middleware.ts        session, role, status, and profile gate
supabase/migrations/   ordered SQL migrations
scripts/               migration runner, schema doctor, student seeder
```

The faculty, HOD, and admin directories are one implementation. Nothing in
`lib/queries/directory.ts` takes a role, a faculty id, or a department:
scoping comes entirely from RLS on `student_directory`, which resolves through
`can_faculty_view_student()`. A mentor sees their assignments, a head of
department sees their department, an administrator sees the institution — and
a bug in the filters can return the wrong subset but cannot return a student
the caller is not entitled to.

## Testing

```bash
npm test
```

181 unit tests covering profile-completion gate logic, every validation schema,
directory filter parsing, CSV escaping, analytics aggregation, the role
table, assessment auto-grading, and event registration rules.

Integration, RLS-policy, and end-to-end tests are planned.

## Deployment

The app deploys to Vercel with no configuration beyond environment variables.

1. Import the repository in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` under **Settings → Environment Variables**.
3. Deploy.

Use separate Supabase projects for development and production once the data
is real rather than demo.

## Project status

| Area | Status |
|---|---|
| Authentication and account lifecycle | Complete |
| Student registration and mandatory profile | Complete |
| Student dashboard | Complete |
| Faculty dashboard, directory, filters, export | Complete |
| HOD portal, department scope, directory, export | Complete |
| Admin analytics, student directory, approvals, roles, assignments, departments, audit | Complete |
| Achievements | Complete |
| Charts over a filtered result set | Complete |
| Assessment engine | Complete |
| Events | Complete |
| VTU resources and certification recommendations | Not started |
| AI development roadmap | Not started |
| Notifications and reporting | Not started |

See [`PRD.md`](PRD.md) for full product requirements and
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the system design.

## Known limitations

- Authentication endpoints are not yet rate-limited.
- Supabase types in [`src/lib/supabase/types.ts`](src/lib/supabase/types.ts)
  are hand-written; regenerate with `supabase gen types` once the schema
  settles.
- `@supabase/ssr` must stay in step with `@supabase/supabase-js`. Older `ssr`
  releases call `SupabaseClient<Database, SchemaName, Schema>`, but
  supabase-js ≥ 2.7x redefined that second generic. A mismatch makes every
  query result resolve to `never` at the type level while still compiling.
- The institution logo is a monogram placeholder.
- Psychometric assessment features, when built, are for self-development and
  mentoring only — never clinical assessment, and never a basis for denying a
  student any opportunity.

## License

Released under the [MIT License](LICENSE).
