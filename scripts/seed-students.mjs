/**
 * Bulk-creates first-year student accounts.
 *
 * Creating a student means creating an auth identity, which the anon key
 * cannot do in bulk and SQL cannot do at all — `auth.users` rows carry hashed
 * credentials that only Supabase Auth may write. So this runs against the
 * Admin API with the service-role key, server-side, never in a browser.
 *
 * What it creates per student:
 *   - an auth identity, email pre-confirmed (these accounts are handed out,
 *     not self-registered, so there is no inbox to click a link in)
 *   - the `users` shadow row, via the existing signup trigger
 *   - the `students` record, with an academic profile row ready to fill in
 *   - status set to 'active', because an account an administrator just
 *     created by hand does not also need that administrator to approve it
 *
 * Each student's password is their own USN plus a suffix — 1HK24AI001 gets
 * `1hk24ai001@hkbk`. Per-student rather than one shared secret: a single
 * password across a cohort is one leak away from every account, and it cannot
 * be rotated for one student without rotating it for all of them.
 *
 * Usage:
 *   node scripts/seed-students.mjs                    # 1HK24AI001–015, AIML
 *   node scripts/seed-students.mjs --dry              # show, change nothing
 *   node scripts/seed-students.mjs --from 1 --to 60
 *   node scripts/seed-students.mjs --dept CSE --prefix 1HK24CS
 *   node scripts/seed-students.mjs --passwordSuffix '@hkbk2026'
 *   node scripts/seed-students.mjs --password 'OneFixed@2026'   # same for all
 *   node scripts/seed-students.mjs --reset-passwords            # existing too
 *
 * Re-running is safe: an existing USN or email is reported and skipped, not
 * duplicated or overwritten. Pass `--reset-passwords` to also reset the
 * password on accounts that already exist — the one case where re-running
 * deliberately changes something.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- Defaults ---------------------------------------------------------------

/**
 * Real student names are personal data and do not belong in a public
 * repository, so they are read from a gitignored file at run time instead of
 * being written into this script.
 *
 * Create `students.local.json` in the project root:
 *
 *     { "1HK24AI001": "Full Name", "1HK24AI002": "Another Name" }
 *
 * Any USN without an entry falls back to its USN as the name, which the
 * student can correct themselves once they sign in.
 */
function loadStudentNames() {
  try {
    return JSON.parse(readFileSync(join(root, "students.local.json"), "utf8"));
  } catch {
    return {};
  }
}

const STUDENT_NAMES = loadStudentNames();

const DEFAULTS = {
  prefix: "1HK24AI",
  from: 1,
  to: 30,
  dept: "AIML",
  domain: "hkbk.edu.in",
  /** Appended to the lowercase USN: 1HK24AI001 -> 1hk24ai001@hkbk */
  passwordSuffix: "@hkbk",
  /** Set to override the per-USN rule with one fixed password for everyone. */
  password: null,
  semester: 1,
  section: "A",
  admissionYear: 2024,
  state: "Karnataka",
  city: "Bengaluru",
  /** Placeholder mobile numbers, one per seat, all unique and well-formed. */
  phoneBase: 9000000000,
  guardianPhoneBase: 9100000000,
};

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // Absent file is fine — the value may come from the real environment.
    }
  }
}

const BOOLEAN_FLAGS = ["--dry", "--reset-passwords"];

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    dry: argv.includes("--dry"),
    resetPasswords: argv.includes("--reset-passwords"),
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--") || BOOLEAN_FLAGS.includes(flag)) continue;
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) continue;

    if (key === "from" || key === "to" || key === "semester") {
      options[key] = Number(value);
    } else if (key in options) {
      options[key] = value;
    }
    i++;
  }

  return options;
}

/** 1HK24AI001 — VTU format, matching the USN pattern the app validates. */
function usnFor(prefix, serial) {
  return `${prefix}${String(serial).padStart(3, "0")}`.toUpperCase();
}

/** Each student's own USN plus the suffix, unless one fixed password was set. */
function passwordFor(usn, options) {
  return options.password ?? `${usn.toLowerCase()}${options.passwordSuffix}`;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.\n" +
        "Supabase → Project Settings → API. The service-role key is server-only —\n" +
        "never prefix it with NEXT_PUBLIC_ and never commit it.\n",
    );
    process.exit(1);
  }

  if (!Number.isInteger(options.from) || !Number.isInteger(options.to) || options.from > options.to) {
    console.error(`\n--from ${options.from} --to ${options.to} is not a valid range.\n`);
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Fail early on a department code that does not exist, rather than after
  // creating auth identities whose student rows will all be rejected by the
  // foreign key.
  const { data: department } = await db
    .from("departments")
    .select("code")
    .eq("code", options.dept)
    .maybeSingle();

  if (!department) {
    console.error(
      `\nNo department with code "${options.dept}". Existing codes come from the departments table.\n`,
    );
    process.exit(1);
  }

  const seats = [];
  for (let serial = options.from; serial <= options.to; serial++) {
    const usn = usnFor(options.prefix, serial);
    const fullName = STUDENT_NAMES[usn];
    if (!fullName) {
      // Skip USNs not present in the official sheet
      continue;
    }
    seats.push({
      serial,
      usn,
      fullName,
      username: usn.toLowerCase(),
      email: `${usn.toLowerCase()}@${options.domain}`,
      password: passwordFor(usn, options),
      phone: String(options.phoneBase + serial),
      guardianPhone: String(options.guardianPhoneBase + serial),
    });
  }

  console.log(
    `\n${seats.length} account(s): ${seats[0].usn} → ${seats[seats.length - 1].usn}\n` +
      `  department  ${options.dept}\n` +
      `  email       <usn>@${options.domain}\n` +
      `  password    ${options.password ?? `<usn>${options.passwordSuffix}`}` +
      `  (e.g. ${seats[0].password})\n` +
      `  semester    ${options.semester}, section ${options.section}\n` +
      (options.resetPasswords
        ? "  existing accounts will have their password reset\n"
        : ""),
  );

  if (options.dry) {
    for (const seat of seats) {
      console.log(`  would create  ${seat.usn} (${seat.fullName})  ${seat.email}  ${seat.password}`);
    }
    console.log("\nDry run — nothing was changed.\n");
    return;
  }

  let created = 0;
  let skipped = 0;
  let reset = 0;
  let failed = 0;
  let updatedName = 0;

  for (const seat of seats) {
    // Check before touching Auth: a student row already carrying this USN
    // means the seat is taken, and creating a second auth identity for it
    // would leave an orphan login with no academic record behind it.
    const { data: existing } = await db
      .from("students")
      .select("id, user_id, full_name")
      .or(`usn.eq.${seat.usn},email.eq.${seat.email}`)
      .maybeSingle();

    if (existing) {
      if (existing.full_name !== seat.fullName) {
        await db
          .from("students")
          .update({ full_name: seat.fullName })
          .eq("id", existing.id);
        console.log(`  update  ${seat.usn}  name set to "${seat.fullName}"`);
        updatedName++;
      }

      if (!options.resetPasswords) {
        console.log(`  skip    ${seat.usn}  already registered`);
        skipped++;
        continue;
      }

      // The student row carries user_id, so the auth identity is reachable
      // without paging through the whole user list to find it by email.
      const { error: resetError } = await db.auth.admin.updateUserById(
        existing.user_id,
        { password: seat.password },
      );

      if (resetError) {
        console.log(`  FAIL    ${seat.usn}  ${resetError.message}`);
        failed++;
      } else {
        console.log(`  reset   ${seat.usn}  ${seat.email}  ${seat.password}`);
        reset++;
      }
      continue;
    }

    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email: seat.email,
      password: seat.password,
      email_confirm: true,
      user_metadata: { role: "student", username: seat.username },
    });

    if (authError || !authData?.user) {
      console.log(`  FAIL    ${seat.usn}  ${authError?.message ?? "no user returned"}`);
      failed++;
      continue;
    }

    const userId = authData.user.id;

    const { data: student, error: studentError } = await db
      .from("students")
      .insert({
        user_id: userId,
        full_name: seat.fullName,
        dob: "2006-01-01",
        usn: seat.usn,
        phone: seat.phone,
        email: seat.email,
        username: seat.username,
        state: options.state,
        city: options.city,
        department_code: options.dept,
        guardian_name: "To be updated",
        guardian_phone: seat.guardianPhone,
        // Identity only. The student completes the rest themselves, and the
        // profile gate holds them at /complete-profile until they do.
        profile_completion_percent: 20,
      })
      .select("id")
      .single();

    if (studentError || !student) {
      // Roll back the auth identity so a failed seat leaves nothing behind
      // that would block a retry on the same USN.
      await db.auth.admin.deleteUser(userId);
      console.log(`  FAIL    ${seat.usn}  ${studentError?.message ?? "insert failed"}`);
      failed++;
      continue;
    }

    await db.from("student_academic_profiles").insert({
      student_id: student.id,
      semester: options.semester,
      section: options.section,
      admission_year: options.admissionYear,
    });

    // Created by an administrator, so it does not also need one to approve it.
    await db.from("users").update({ status: "active" }).eq("id", userId);

    console.log(`  create  ${seat.usn}  ${seat.email}  ${seat.password}`);
    created++;
  }

  console.log(
    `\n${created} created · ${reset} password reset · ${skipped} skipped · ${failed} failed\n` +
      (created > 0 || reset > 0
        ? "Students sign in at /login with their USN email and their own USN\n" +
          `password (${seats[0].email} / ${seats[0].password}), then complete\n` +
          "their profile before the dashboard unlocks.\n\n" +
          "These are handout credentials, not secrets: the password is derivable\n" +
          "from the USN, so anyone who knows a student's USN knows their password\n" +
          "until they change it. Have students change it on first sign-in.\n"
        : ""),
  );

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
