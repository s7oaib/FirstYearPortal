import "server-only";

import { createClient } from "@/lib/supabase/server";
import { pivotToComponents, releasedOnly, sumRecorded } from "@/lib/marks/compute";
import type { MarkComponent, MarkEntry } from "@/config/marks";
import type { AnalyticsMarkRow } from "@/lib/admin/analytics";

/**
 * Internal marks reads (migration 0025).
 *
 * Like `queries/directory.ts`, nothing here takes a role, a faculty id, or a
 * department: the staff grid is scoped by RLS through
 * `can_faculty_view_student()`, and a student's own card by the policy keyed
 * on `auth.uid()`. A faculty member and a head of department call the same
 * function and get their own students back.
 *
 * A missing migration degrades to an empty list rather than throwing, which is
 * the convention `check-schema.mjs` exists to compensate for.
 */

type ComponentRow = {
  code: string;
  label: string;
  max_marks: number;
  sort_order: number;
  is_active: boolean;
};

type MarkRow = {
  student_id: string;
  subject_id: string;
  component_code: string;
  marks: number | string | null;
  max_marks: number;
  remark: string | null;
  published_at: string | null;
};

/**
 * Normalises a `numeric` column to a JS number.
 *
 * The installed stack hands these back as numbers (verified against the live
 * database), but PostgREST is entitled to serialise `numeric` as a string —
 * JS numbers cannot represent every value the type can hold — and other
 * versions do. These are marks out of 20, so narrowing is safe either way;
 * accepting both is what stops a driver upgrade turning `17.5` into text that
 * sorts and sums wrongly rather than throwing.
 */
function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapEntry(row: MarkRow): MarkEntry {
  return {
    componentCode: row.component_code,
    marks: toNumber(row.marks),
    maxMarks: row.max_marks,
    remark: row.remark,
    publishedAt: row.published_at,
  };
}

/** The component definitions, in the order they should be shown. */
export async function listMarkComponents(): Promise<MarkComponent[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("mark_components")
    .select("code, label, max_marks, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order")
    .order("code");

  return ((data ?? []) as ComponentRow[]).map((row) => ({
    code: row.code,
    label: row.label,
    maxMarks: row.max_marks,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

// --- Staff side --------------------------------------------------------------

export type MarksGridStudent = {
  studentId: string;
  fullName: string;
  usn: string;
  section: string | null;
  /** One cell per component, in definition order. */
  cells: MarkEntry[];
};

export type MarksGrid = {
  components: MarkComponent[];
  students: MarksGridStudent[];
  /** Components with at least one row already released, so the UI can say so. */
  releasedComponents: string[];
};

/**
 * Everyone the caller may mark for one subject, with whatever is recorded.
 *
 * The roster comes from `student_directory` — the same RLS-scoped view the
 * student directory reads — narrowed to the subject's own department and
 * semester. A student in the right department but the wrong semester is not
 * sitting this paper, and a student the caller cannot see is not returned at
 * all, because the view will not yield them.
 */
export async function getMarksGrid(
  subjectId: string,
  section: string | null = null,
): Promise<MarksGrid | null> {
  const supabase = createClient();

  // Issued together: the component list does not depend on the subject, and a
  // Supabase round-trip from here costs ~200ms, so awaiting them in sequence
  // spends a fifth of a second doing nothing. Same reasoning throughout this
  // file — only genuinely dependent reads are allowed to wait for each other.
  const [{ data: subject }, components] = await Promise.all([
    supabase
      .from("vtu_subjects")
      .select("id, department_code, semester")
      .eq("id", subjectId)
      .single(),
    listMarkComponents(),
  ]);

  if (!subject) return null;

  let rosterQuery = supabase
    .from("student_directory")
    .select("id, full_name, usn, section")
    .eq("department_code", subject.department_code)
    .eq("semester", subject.semester)
    .order("usn")
    .limit(500);

  if (section) rosterQuery = rosterQuery.eq("section", section);

  const { data: roster } = await rosterQuery;
  const rosterRows = (roster ?? []) as Array<{
    id: string;
    full_name: string;
    usn: string;
    section: string | null;
  }>;

  if (rosterRows.length === 0) {
    return { components, students: [], releasedComponents: [] };
  }

  const { data: markRows } = await supabase
    .from("student_subject_marks")
    .select(
      "student_id, subject_id, component_code, marks, max_marks, remark, published_at",
    )
    .eq("subject_id", subjectId)
    .in(
      "student_id",
      rosterRows.map((r) => r.id),
    );

  const byStudent = new Map<string, MarkEntry[]>();
  const released = new Set<string>();

  for (const row of (markRows ?? []) as MarkRow[]) {
    const entry = mapEntry(row);
    byStudent.set(row.student_id, [
      ...(byStudent.get(row.student_id) ?? []),
      entry,
    ]);
    if (entry.publishedAt !== null) released.add(entry.componentCode);
  }

  return {
    components,
    releasedComponents: [...released],
    students: rosterRows.map((row) => ({
      studentId: row.id,
      fullName: row.full_name,
      usn: row.usn,
      section: row.section,
      cells: pivotToComponents(components, byStudent.get(row.id) ?? []),
    })),
  };
}

/**
 * Subjects the caller may actually mark, for the picker (migration 0026).
 *
 * Narrowed by `my_markable_subject_ids()` — the subject teacher's own
 * subjects, or every subject in the department for a HOD or administrator.
 * Offering a subject the caller cannot save would produce a grid that
 * refuses every write with nothing on screen explaining why.
 *
 * A database that has not had 0026 applied returns no ids and therefore no
 * subjects, which is the wrong answer in the safe direction: the screen says
 * nothing is assigned rather than silently letting anyone mark anything.
 */
export async function listMarkableSubjects(departmentCode: string): Promise<
  Array<{ id: string; code: string; name: string; semester: number }>
> {
  const supabase = createClient();

  const { data: allowed } = await supabase.rpc("my_markable_subject_ids");
  const allowedIds = (allowed ?? []) as string[];
  if (allowedIds.length === 0) return [];

  const { data } = await supabase
    .from("vtu_subjects")
    .select("id, code, name, semester, scheme_year")
    .eq("department_code", departmentCode)
    .eq("is_active", true)
    .in("id", allowedIds)
    .order("semester")
    .order("scheme_year", { ascending: false })
    .order("code")
    .limit(300);

  return ((data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    semester: number;
  }>).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    semester: row.semester,
  }));
}

// --- Who teaches what (migration 0026) --------------------------------------

export type SubjectAssignment = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  departmentCode: string;
  semester: number;
  facultyId: string;
  facultyName: string;
  facultyEmail: string;
  /** Null means every section. */
  section: string | null;
};

/**
 * Teaching assignments on file — every department, or just one.
 *
 * `subject_faculty`'s read policy is `using (true)`, because a timetable is
 * not a disclosure. That is right for the database and wrong for a screen: a
 * head of department managing their own staff should not be shown, or have to
 * scroll past, five other departments. Hence the filter, applied here rather
 * than in RLS.
 *
 * Three queries rather than embedded joins, for the `Relationships: []`
 * reason documented in `supabase/types.ts`. One row per subject-teacher pair,
 * so this stays small.
 */
export async function listSubjectAssignments(
  departmentCode?: string,
): Promise<SubjectAssignment[]> {
  const supabase = createClient();

  const { data: links } = await supabase
    .from("subject_faculty")
    .select("subject_id, faculty_id, section")
    .limit(1000);

  const rows = (links ?? []) as Array<{
    subject_id: string;
    faculty_id: string;
    section: string | null;
  }>;
  if (rows.length === 0) return [];

  const [{ data: subjects }, { data: staff }] = await Promise.all([
    supabase
      .from("vtu_subjects")
      .select("id, code, name, department_code, semester")
      .in("id", [...new Set(rows.map((r) => r.subject_id))]),
    supabase
      .from("faculty")
      .select("id, full_name, email")
      .in("id", [...new Set(rows.map((r) => r.faculty_id))]),
  ]);

  const subjectById = new Map(
    ((subjects ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      department_code: string;
      semester: number;
    }>).map((row) => [row.id, row]),
  );
  const staffById = new Map(
    ((staff ?? []) as Array<{ id: string; full_name: string; email: string }>).map(
      (row) => [row.id, row],
    ),
  );

  return rows
    .map((row) => {
      const subject = subjectById.get(row.subject_id);
      const person = staffById.get(row.faculty_id);
      if (!subject || !person) return null;
      if (departmentCode && subject.department_code !== departmentCode) {
        return null;
      }
      return {
        subjectId: row.subject_id,
        subjectCode: subject.code,
        subjectName: subject.name,
        departmentCode: subject.department_code,
        semester: subject.semester,
        facultyId: row.faculty_id,
        facultyName: person.full_name,
        facultyEmail: person.email,
        section: row.section,
      };
    })
    .filter((row): row is SubjectAssignment => row !== null)
    .sort(
      (a, b) =>
        a.departmentCode.localeCompare(b.departmentCode) ||
        a.semester - b.semester ||
        a.subjectCode.localeCompare(b.subjectCode) ||
        a.facultyName.localeCompare(b.facultyName),
    );
}

// --- Reporting --------------------------------------------------------------

/** One student's marks for one subject, flattened for a CSV row. */
export type MarksExportRow = {
  studentId: string;
  subjectCode: string;
  subjectName: string;
  semester: number;
  /** Keyed by component code; absent means no mark recorded. */
  byComponent: Map<string, MarkEntry>;
  scored: number;
  outOf: number;
  /** Component labels a student cannot see yet. */
  unreleased: string[];
};

/**
 * Every mark on file for the given students, one row per student-subject.
 *
 * Reads are RLS-scoped exactly as the grid is, so a caller gets marks for the
 * students they may see and nobody else's — the export cannot widen what the
 * screen shows.
 *
 * Unlike the student's own view this keeps unreleased components, because the
 * staff member reading the report is the one deciding whether to release
 * them. They are named in `unreleased` rather than silently mixed in, so a
 * figure in this file is never mistaken for one the student has seen.
 */
export async function listMarksForExport(
  studentIds: string[],
  components: MarkComponent[],
): Promise<MarksExportRow[]> {
  if (studentIds.length === 0) return [];

  const supabase = createClient();
  const labelByCode = new Map(components.map((c) => [c.code, c.label]));

  // Chunked: a department export can exceed what one `in` filter should carry.
  const CHUNK = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    chunks.push(studentIds.slice(i, i + CHUNK));
  }

  // Chunks are independent, so they go out together. In series an
  // institution-wide export would pay a full round-trip per 200 students.
  const responses = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("student_subject_marks")
        .select(
          "student_id, subject_id, component_code, marks, max_marks, remark, published_at",
        )
        .in("student_id", ids),
    ),
  );

  const markRows: MarkRow[] = responses.flatMap(
    ({ data }) => (data ?? []) as MarkRow[],
  );

  if (markRows.length === 0) return [];

  const { data: subjectRows } = await supabase
    .from("vtu_subjects")
    .select("id, code, name, semester")
    .in("id", [...new Set(markRows.map((r) => r.subject_id))]);

  const subjectById = new Map(
    ((subjectRows ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      semester: number;
    }>).map((row) => [row.id, row]),
  );

  const grouped = new Map<string, MarksExportRow>();

  for (const row of markRows) {
    const subject = subjectById.get(row.subject_id);
    if (!subject) continue;

    const key = `${row.student_id}:${row.subject_id}`;
    const existing =
      grouped.get(key) ??
      ({
        studentId: row.student_id,
        subjectCode: subject.code,
        subjectName: subject.name,
        semester: subject.semester,
        byComponent: new Map<string, MarkEntry>(),
        scored: 0,
        outOf: 0,
        unreleased: [],
      } satisfies MarksExportRow);

    const entry = mapEntry(row);
    existing.byComponent.set(entry.componentCode, entry);
    if (entry.publishedAt === null) {
      existing.unreleased.push(
        labelByCode.get(entry.componentCode) ?? entry.componentCode,
      );
    }
    grouped.set(key, existing);
  }

  // Totals use the same helper the screens do, so a report and a page can
  // never disagree about a student's sum.
  for (const row of grouped.values()) {
    const { scored, outOf } = sumRecorded([...row.byComponent.values()]);
    row.scored = scored;
    row.outOf = outOf;
  }

  return [...grouped.values()].sort(
    (a, b) => a.subjectCode.localeCompare(b.subjectCode),
  );
}

/**
 * Every mark the caller may read, flattened with the student's department,
 * for the institution analytics (PRD 5.6).
 *
 * RLS-scoped like everything else here, so an administrator gets the
 * institution and nobody else would get more than their own scope from the
 * same call. Returns the raw rows rather than aggregates: the arithmetic
 * lives in `admin/analytics.ts` where it can be unit-tested against fixtures.
 */
export async function listMarkRowsForAnalytics(
  studentDepartments: Map<string, string>,
): Promise<AnalyticsMarkRow[]> {
  const studentIds = [...studentDepartments.keys()];
  if (studentIds.length === 0) return [];

  const supabase = createClient();
  const CHUNK = 200;
  const rows: AnalyticsMarkRow[] = [];

  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    chunks.push(studentIds.slice(i, i + CHUNK));
  }

  // Together rather than in series — see listMarksForExport.
  const responses = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("student_subject_marks")
        .select("student_id, component_code, marks, max_marks, published_at")
        .in("student_id", ids),
    ),
  );

  for (const { data } of responses) {
    for (const row of (data ?? []) as Array<{
      student_id: string;
      component_code: string;
      marks: number | string | null;
      max_marks: number;
      published_at: string | null;
    }>) {
      const departmentCode = studentDepartments.get(row.student_id);
      if (!departmentCode) continue;

      rows.push({
        studentId: row.student_id,
        departmentCode,
        componentCode: row.component_code,
        marks: toNumber(row.marks),
        maxMarks: row.max_marks,
        released: row.published_at !== null,
      });
    }
  }

  return rows;
}

/** Per-student marks totals, for a summary column on the details export. */
export type MarksSummary = {
  subjectCount: number;
  scored: number;
  outOf: number;
};

export async function getMarksSummary(
  studentIds: string[],
  components: MarkComponent[],
): Promise<Map<string, MarksSummary>> {
  const rows = await listMarksForExport(studentIds, components);
  const summary = new Map<string, MarksSummary>();

  for (const row of rows) {
    const existing = summary.get(row.studentId) ?? {
      subjectCount: 0,
      scored: 0,
      outOf: 0,
    };
    existing.subjectCount += 1;
    existing.scored = Math.round((existing.scored + row.scored) * 100) / 100;
    existing.outOf += row.outOf;
    summary.set(row.studentId, existing);
  }

  return summary;
}

/**
 * Staff who can be assigned to teach, for the picker — every department, or
 * just one. A head of department assigns their own people.
 */
export async function listAssignableFaculty(
  departmentCode?: string,
): Promise<
  Array<{ id: string; fullName: string; email: string; departmentCode: string }>
> {
  const supabase = createClient();
  let query = supabase
    .from("faculty")
    .select("id, full_name, email, department_code")
    .order("full_name")
    .limit(500);

  if (departmentCode) query = query.eq("department_code", departmentCode);

  const { data } = await query;

  return ((data ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    department_code: string;
  }>).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    departmentCode: row.department_code,
  }));
}

// --- Student side ------------------------------------------------------------

export type StudentSubjectMarks = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  cells: MarkEntry[];
  scored: number;
  outOf: number;
  recordedCount: number;
};

/**
 * The signed-in student's own card, one row per subject.
 *
 * RLS already withholds unreleased components, but `releasedOnly()` runs
 * anyway: this same function backs the staff preview of a student's card,
 * where the caller *can* read unreleased rows, and a total that silently
 * included them would show staff a figure the student cannot see.
 *
 * Subjects with nothing released at all are dropped rather than rendered
 * empty — a table of dashes tells a student nothing except that the portal
 * knows their timetable.
 */
export async function getStudentMarks(
  studentId: string,
): Promise<StudentSubjectMarks[]> {
  const supabase = createClient();

  // Independent of each other, so issued together — see getMarksGrid.
  const [components, { data }] = await Promise.all([
    listMarkComponents(),
    supabase
      .from("student_subject_marks")
      .select(
        "student_id, subject_id, component_code, marks, max_marks, remark, published_at",
      )
      .eq("student_id", studentId)
      .limit(500),
  ]);

  const markRows = (data ?? []) as MarkRow[];
  if (markRows.length === 0) return [];

  // Subject names come from a second query rather than an embedded join: the
  // hand-written types carry `Relationships: []` (see `supabase/types.ts`), so
  // postgrest-js cannot resolve `vtu_subjects(...)` at the type level. Same
  // approach as `attachDomains()` in `queries/vtu.ts`.
  const { data: subjectRows } = await supabase
    .from("vtu_subjects")
    .select("id, code, name")
    .in("id", [...new Set(markRows.map((r) => r.subject_id))]);

  const subjectById = new Map(
    ((subjectRows ?? []) as Array<{ id: string; code: string; name: string }>).map(
      (row) => [row.id, row],
    ),
  );

  const bySubject = new Map<
    string,
    { code: string; name: string; entries: MarkEntry[] }
  >();

  for (const row of markRows) {
    const subject = subjectById.get(row.subject_id);
    if (!subject) continue;

    const existing = bySubject.get(row.subject_id) ?? {
      code: subject.code,
      name: subject.name,
      entries: [],
    };
    existing.entries.push(mapEntry(row));
    bySubject.set(row.subject_id, existing);
  }

  const result: StudentSubjectMarks[] = [];

  for (const [subjectId, subject] of bySubject) {
    const visible = releasedOnly(subject.entries);
    if (visible.length === 0) continue;

    const { scored, outOf, recordedCount } = sumRecorded(visible);

    result.push({
      subjectId,
      subjectCode: subject.code,
      subjectName: subject.name,
      cells: pivotToComponents(components, visible),
      scored,
      outOf,
      recordedCount,
    });
  }

  return result.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
}
