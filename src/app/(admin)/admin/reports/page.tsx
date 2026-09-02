import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { getOwnAdmin } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  {
    title: "Every student",
    description:
      "One row per student with academic, contact, and completion columns. Guardian contact is included because you are an administrator.",
    href: "/admin/students/export",
    note: "Add filters on the All students page first to narrow it — the export follows whatever is on screen.",
  },
  {
    title: "Institution summary",
    description:
      "Aggregates only: completion rates, department comparison, and distributions by quota, residence, semester, and home state.",
    href: "/admin/export",
    note: "No student rows, so it can be shared more freely than the one above.",
  },
];

/**
 * Where reports are found (PRD 5.11).
 *
 * A page rather than scattered buttons, because a report is something people
 * come looking for rather than stumble across — and because every file here
 * carries student personal data, which is worth saying once, plainly, in the
 * place where someone is about to download one.
 */
export default async function AdminReportsPage() {
  const admin = await getOwnAdmin();
  if (!admin) redirect("/account-blocked?reason=no-staff-record");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">Reports</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Every export carries a header naming who generated it, when, and
          which filters produced it — so a file that has been emailed around
          can still be traced back to the query behind it.
        </p>
      </header>

      <p className="rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-sm text-warning">
        These files contain personal data about real students. They are served
        with no-store headers so nothing caches them, but once a file is on
        your machine it is your responsibility — do not email it onward
        without a reason to.
      </p>

      <ul className="space-y-3">
        {REPORTS.map((report) => (
          <li key={report.href}>
            <Card as="section">
              <CardHeader
                title={report.title}
                description={report.description}
              />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-xs text-ink-faint">{report.note}</p>
                <ButtonLink href={report.href} variant="secondary">
                  Download CSV
                </ButtonLink>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <Card as="section">
        <CardHeader
          title="Not available yet"
          description="Listed so it is clear what this screen does not do."
        />
        <CardBody>
          <ul className="space-y-2 text-sm text-ink-muted">
            <li>
              <span className="font-medium text-ink">PDF export.</span> Needs a
              document-generation dependency, which is a decision worth making
              deliberately rather than adding on the way past. CSV opens in
              Excel and Sheets and covers the reporting need today.
            </li>
            <li>
              <span className="font-medium text-ink">
                Assessment and event reports.
              </span>{" "}
              The data exists; the exports do not. Results are visible per
              assessment and per event in the meantime.
            </li>
            <li>
              <span className="font-medium text-ink">Saved report presets.</span>{" "}
              Filters live in the URL, so a filtered directory view can be
              bookmarked or shared as a link today.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
