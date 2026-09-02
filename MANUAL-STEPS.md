# Manual steps and known gaps

Everything in this file needs a person. It is either something the code
cannot do for itself, something that needs a decision nobody has made yet, or
something deliberately left unbuilt with the reason recorded.

Kept separate from `README.md` because that file describes the product as it
stands; this one describes what is still owed.

Last updated when PRD module 5.11 (notifications and reports) landed.

---

## 1. Apply the outstanding migrations

**Status: required. Nothing in modules 5.7–5.11 works until this is done.**

Migrations `0013`–`0017` are written but not applied to the live database:

| Migration | Adds |
|---|---|
| `0013_assessments.sql` | Assessment engine |
| `0014_events.sql` | Events, registration, attendance |
| `0015_resources.sql` | Resource catalogue |
| `0016_roadmaps.sql` | Development roadmaps |
| `0017_notifications.sql` | Notifications, and the realtime publication |

Check what is missing at any time:

```bash
npm run check:schema
```

Apply them either way:

```bash
npm run migrate        # needs DATABASE_URL in .env.local
```

or paste each file into the Supabase SQL Editor, one at a time, in order.

**Why this cannot be automated here:** applying a migration is DDL, and the
Supabase client libraries do not execute DDL. It needs either a direct
Postgres connection (`DATABASE_URL`, which carries the database password) or
the dashboard. Neither is available to the tooling in this repository by
design — a service-role key deliberately cannot restructure the schema.

To set up `npm run migrate` once and stop pasting:

1. Supabase dashboard → **Project Settings** → **Database** → **Connection
   string** → **URI**
2. Replace `[YOUR-PASSWORD]` with the database password
3. Add it to `.env.local` as `DATABASE_URL=…` (the file is gitignored)

---

## 2. Real student names are not in this repository

**Status: handled, but keep it that way.**

`scripts/seed-students.mjs` reads names from `students.local.json`, which is
gitignored. Create it in the project root:

```json
{
  "1HK24AI001": "Full Name",
  "1HK24AI002": "Another Name"
}
```

Any USN without an entry falls back to its own USN as the name, which the
student can correct once they sign in.

**Do not put real names back into a tracked file.** They were committed and
pushed once, on 2026-08-19, and the branch was rewritten to remove them. It
matters more here than in most projects: a seeded password is derived from
the USN, so a file containing name + USN is a file containing name + USN +
password.

If that combination ever reaches a public branch again, treat the seeded
passwords as compromised and reset them:

```bash
npm run seed:students -- --reset-passwords
```

---

## 3. Decisions nobody has made yet

### 3.1 AI provider for the roadmap

**Status: open. Blocks the AI half of PRD 5.10.**

The roadmap generator interface exists (`src/lib/roadmap/provider.ts`) and
every roadmap records `source`, `provider`, and `model`. Only the rule-based
implementation sits behind it.

What is needed before the AI path can be written:

- **Which provider**, and its data-handling terms for student information.
  This is a privacy decision, not a technical one — the prompt would carry a
  student's department, goals, domains, interests, and school marks.
- **An API key**, as a server-only environment variable. There is no
  `ANTHROPIC_API_KEY` or equivalent in `.env.local` today.

The rule-based generator is not a placeholder waiting to be replaced. PRD 5.10
requires a fallback that works when the provider is unavailable, so it has to
exist regardless — and it works with nothing configured.

### 3.2 Seeded student passwords

**Status: works, but is a handout scheme rather than a security one.**

Each seeded student's password is their own USN plus `@hkbk`
(`1hk24ai001` → `1hk24ai001@hkbk`). Anyone who knows a registration number
knows that student's password until they change it.

That is a reasonable way to hand out fifty accounts on day one. It is not a
reasonable steady state. Either tell students to change it at first sign-in,
or change the suffix to something not derivable:

```bash
npm run seed:students -- --passwordSuffix '@somethingElse'
```

Note the password also fails the portal's own strength rules (no uppercase),
so a student resetting it will be asked for something stronger. That is
intentional.

---

## 4. Data the portal is waiting for

These are not bugs. Features look empty until somebody puts something in.

| What | Who does it | Where |
|---|---|---|
| **Faculty assignments** | An administrator | Admin → Faculty assignments |
| **Resource catalogue** | Faculty or an administrator | Admin → Resources |
| **Assessments** | Faculty or a HOD | Faculty → Assessments → New |
| **Events** | Faculty or a HOD | Faculty → Events → New |
| **Roadmaps** | A mentor, per student | A student's profile → Generate |

**Faculty assignments are the one that catches people out.** A faculty member
with no assignment rows sees an empty student directory and concludes the
filters are broken. They are not: `can_faculty_view_student()` returns false
for everyone until an assignment exists. Heads of department and
administrators do not need one.

The resource catalogue ships **empty on purpose**. PRD 5.9 forbids fabricated
URLs and metadata, and a plausible-looking link nobody has opened is exactly
that. It is filled by people, and every entry shows as unchecked until an
administrator confirms it.

---

## 5. Placeholder data to correct

| Field | Current value | Why |
|---|---|---|
| `faculty.phone` for `hod.aiml@hkbk.edu.in` | `9999999999` | The account was created as an administrator only and had no phone; the column is NOT NULL and UNIQUE, so migration 0012 had to write something |
| Seeded students' `phone` | `90000000NN` | Placeholders, unique and well-formed, so the unique constraint holds |
| Seeded students' `guardian_phone` | `91000000NN` | As above |
| Seeded students' `guardian_name` | `To be updated` | As above |
| Institution logo | `public/hkbk-logo.png` | Confirm this is the official asset |

Students can correct their own contact details; the HOD phone needs an
administrator.

---

## 6. Built deliberately narrower than the PRD

Each of these is a considered scope decision rather than an oversight.

### PDF export (5.11)
CSV only. PDF needs a document-generation dependency, and adding one is a
decision worth making deliberately rather than on the way past. CSV opens in
Excel and Sheets and covers the reporting need.

### Section-wise English scoring (5.7)
An English assessment is carried as its own kind but scores as one total
rather than by section. No CEFR level is claimed anywhere, which was the
constraint that actually mattered.

### Assessment timer (5.7)
`duration_minutes` is displayed but not enforced. Enforcing it properly means
handling clock skew, tab closes, and network drops without ever destroying a
student's work — that deserves its own design pass rather than a
`setTimeout`.

### Broadcast notifications on event publication (5.11)
Notifications are raised for events that concern one person: an achievement
verified, an attempt marked, a waiting-list place opening, a roadmap
approved. Publishing an event to a whole department is a fan-out to hundreds
of rows in one trigger, which needs batching rather than a row-level insert.

### Certificates for event attendees (5.8)
Needs document generation and a storage bucket. Attendance is recorded, so
the data a certificate would draw on exists.

### Recommendations from assessment performance (5.9)
Resources match on department, interests, goals, and domains. Matching on
assessment results needs results to exist first.

---

## 7. Things worth doing before real students use this

- **Rate limiting on authentication endpoints.** Not implemented. Noted in
  `README.md` under known limitations.
- **Email verification enforcement.** Registration currently depends on
  Supabase's "Confirm email" being *off*, because the student record is
  written using the session `signUp` returns.
- **Regenerate `src/lib/supabase/types.ts`.** It is hand-written and now
  mirrors seventeen migrations. `supabase gen types typescript` would remove a
  whole class of drift.
- **Integration and RLS-policy tests.** The 222 unit tests cover pure logic
  only. The RLS policies have been verified by hand against the live database
  several times, but nothing re-checks them automatically.
- **Separate Supabase projects** for development and production. There is one
  today, and it now holds real student names.

---

## 8. Merge order for the open pull requests

Each branch is stacked on the one before it. Merging out of order will
produce conflicts in the shared layout files.

1. `assessment-engine`
2. `events-module`
3. `resources-module`
4. `roadmap-module`
5. `notifications-module`

CodeRabbit reviews pull requests only, so merging a branch locally skips its
review.
