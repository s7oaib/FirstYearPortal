/**
 * Fills the remaining profile sections for seeded demo students with random,
 * plausible data — residence type, 10th/12th percentage, quota, and at least
 * one interest/goal/domain each — so their dashboards unlock without anyone
 * clicking through /complete-profile by hand.
 *
 * `scripts/seed-students.mjs` only ever writes identity fields (PRD 5.2 says
 * the student fills the rest themselves), which is why a fresh cohort sits at
 * 20% complete. This is the demo-data counterpart for accounts nobody is
 * going to personally log into and click through.
 *
 * Only touches students who are NOT already at 100% — a student who has
 * already completed their own profile, or been filled in a previous run, is
 * left untouched rather than overwritten.
 *
 * Usage:
 *   node scripts/fill-demo-profiles.mjs                  # 1HK24AI001–030, AIML
 *   node scripts/fill-demo-profiles.mjs --dry
 *   node scripts/fill-demo-profiles.mjs --prefix 1HK24AI --from 1 --to 30
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const RESIDENCE_VALUES = ["hostel", "pg", "flat", "home"];
const QUOTA_VALUES = ["cet", "comedk", "management", "jee", "diploma_lateral", "other"];

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const [, key, value] = match;
        if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    } catch {
      // Absent file is fine.
    }
  }
}

function parseArgs(argv) {
  const options = { prefix: "1HK24AI", from: 1, to: 30, dry: argv.includes("--dry") };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--") || flag === "--dry") continue;
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) continue;
    if (key === "from" || key === "to") options[key] = Number(value);
    else if (key in options) options[key] = value;
    i++;
  }
  return options;
}

function usnFor(prefix, serial) {
  return `${prefix}${String(serial).padStart(3, "0")}`.toUpperCase();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** n unique ids drawn from [1..max], order shuffled — the first is "primary". */
function pickUnique(max, count) {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** A realistic-looking mark: mostly comfortable passes, occasionally borderline. */
function randomPercentage() {
  return Math.round(55 + Math.random() * 40); // 55–95
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.\n",
    );
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const usns = [];
  for (let serial = options.from; serial <= options.to; serial++) {
    usns.push(usnFor(options.prefix, serial));
  }

  const { data: students, error } = await db
    .from("students")
    .select("id, usn, profile_completion_percent, residence_type")
    .in("usn", usns)
    .order("usn");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const found = new Set(students.map((s) => s.usn));
  const missing = usns.filter((u) => !found.has(u));

  console.log(`\n${students.length}/${usns.length} accounts found${options.dry ? "  (dry run)" : ""}\n`);
  if (missing.length) {
    console.log(`  not created: ${missing.join(", ")}\n`);
  }

  const targets = students.filter((s) => s.profile_completion_percent !== 100);
  const alreadyDone = students.length - targets.length;

  if (alreadyDone > 0) {
    console.log(`  ${alreadyDone} already at 100% — left untouched\n`);
  }

  let filled = 0;
  let failed = 0;

  for (const s of targets) {
    const residence = s.residence_type ?? pick(RESIDENCE_VALUES);
    const tenth = randomPercentage();
    const twelfth = randomPercentage();
    const quota = pick(QUOTA_VALUES);

    const interestIds = pickUnique(14, 2 + Math.floor(Math.random() * 3)); // 2–4
    const goalIds = pickUnique(8, 1 + Math.floor(Math.random() * 2)); // 1–2
    const domainIds = pickUnique(12, 2 + Math.floor(Math.random() * 2)); // 2–3

    console.log(
      `  ${s.usn}  residence=${residence}  10th=${tenth}  12th=${twelfth}  quota=${quota}  ` +
        `interests=[${interestIds}]  goals=[${goalIds}]  domains=[${domainIds}]`,
    );

    if (options.dry) {
      filled++;
      continue;
    }

    const { error: studentErr } = await db
      .from("students")
      .update({ residence_type: residence, profile_completion_percent: 100 })
      .eq("id", s.id);

    const { error: academicErr } = await db
      .from("student_academic_profiles")
      .update({ tenth_percentage: tenth, twelfth_percentage: twelfth, quota })
      .eq("student_id", s.id);

    // Junction rows are seeded fresh, so delete-then-insert is safe and
    // idempotent rather than trying to diff against whatever is already there.
    await db.from("student_interests").delete().eq("student_id", s.id);
    await db.from("student_goals").delete().eq("student_id", s.id);
    await db.from("student_domains").delete().eq("student_id", s.id);

    const { error: interestErr } = await db
      .from("student_interests")
      .insert(interestIds.map((interest_id) => ({ student_id: s.id, interest_id })));

    const { error: goalErr } = await db.from("student_goals").insert(
      goalIds.map((goal_id, i) => ({ student_id: s.id, goal_id, is_primary: i === 0 })),
    );

    const { error: domainErr } = await db.from("student_domains").insert(
      domainIds.map((domain_id, i) => ({ student_id: s.id, domain_id, is_primary: i === 0 })),
    );

    const firstErr = studentErr || academicErr || interestErr || goalErr || domainErr;
    if (firstErr) {
      console.log(`    FAILED: ${firstErr.message}`);
      failed++;
      continue;
    }

    filled++;
  }

  console.log(
    `\n${filled} ${options.dry ? "would be filled" : "filled"} · ${alreadyDone} already complete · ${failed} failed\n`,
  );
}

main();
