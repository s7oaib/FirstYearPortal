/**
 * Schema doctor — reports which migrations the live database is missing.
 *
 * The app is written so a missing migration degrades quietly rather than
 * crashing: queries return empty results instead of throwing. That is the
 * right behaviour in production and a terrible one while setting up, because
 * "the achievements page is empty" and "the achievements table does not
 * exist" look identical from the browser. This tells them apart.
 *
 * Probes for the objects each migration creates rather than reading
 * `schema_migrations`, so it gives a true answer even when migrations were
 * pasted into the Supabase SQL Editor by hand and never recorded.
 *
 * Usage:  npm run check:schema
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local.\n",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/** True when the table exists and is reachable. */
async function tableExists(name) {
  const { error } = await db.from(name).select("*").limit(1);
  return !error;
}

/** True when the table has the named column. */
async function columnExists(table, column) {
  const { error } = await db.from(table).select(column).limit(1);
  return !error;
}

/** True when the enum accepts the value — probed through a function call. */
async function roleEnumHasHod() {
  const { error } = await db.from("users").select("id").eq("role", "hod").limit(1);
  return !error;
}

const CHECKS = [
  {
    migration: "0001_init_mvp.sql",
    label: "core schema",
    probe: () => tableExists("students"),
  },
  {
    migration: "0003_faculty.sql",
    label: "faculty, assignments, directory view",
    probe: () => tableExists("faculty_student_assignments"),
  },
  {
    migration: "0004_admin.sql",
    label: "admin records",
    probe: () => tableExists("admins"),
  },
  {
    migration: "0007_residence_type.sql",
    label: "residence_type column",
    probe: () => columnExists("student_directory", "residence_type"),
  },
  {
    migration: "0009_achievements.sql",
    label: "achievements and evidence",
    probe: () => tableExists("achievements"),
  },
  {
    migration: "0010_hod_role_enum.sql",
    label: "'hod' value on user_role",
    probe: roleEnumHasHod,
  },
  {
    migration: "0011_hod_scope_and_admin_allowlist.sql",
    label: "HOD scope + administrator allow-list",
    probe: () => tableExists("admin_allowlist"),
  },
  {
    migration: "0012_multiple_roles.sql",
    label: "one account, multiple roles",
    probe: () => tableExists("user_roles"),
  },
  {
    migration: "0013_assessments.sql",
    label: "assessment engine",
    probe: () => tableExists("assessments"),
  },
  {
    migration: "0014_events.sql",
    label: "events, registration, attendance",
    probe: () => tableExists("events"),
  },
  {
    migration: "0015_resources.sql",
    label: "resource catalogue and recommendations",
    probe: () => tableExists("resources"),
  },
];

console.log(`\nChecking ${url}\n`);

const missing = [];

for (const check of CHECKS) {
  const ok = await check.probe();
  console.log(`  ${ok ? "ok     " : "MISSING"}  ${check.migration}  — ${check.label}`);
  if (!ok) missing.push(check.migration);
}

if (missing.length === 0) {
  console.log("\nEvery migration is applied.\n");
  process.exit(0);
}

console.log(
  `\n${missing.length} migration(s) not applied:\n` +
    missing.map((m) => `  - supabase/migrations/${m}`).join("\n") +
    "\n\nApply them in order. Either:\n" +
    "  npm run migrate                 (needs DATABASE_URL in .env.local)\n" +
    "or paste each file into the Supabase SQL Editor, one at a time.\n\n" +
    "0010 and 0011 must be run as two separate statements — PostgreSQL will not\n" +
    "let one transaction add an enum value and then use it.\n",
);

process.exit(1);
