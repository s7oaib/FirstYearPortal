import { redirect } from "next/navigation";
import { StudentNav, type NavItem } from "@/components/layout/StudentNav";
import { PortalSwitcher } from "@/components/layout/PortalSwitcher";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getOwnFaculty } from "@/lib/queries/faculty";
import { getPendingVerificationCount } from "@/lib/queries/achievements";
import { getPendingMarkingCount } from "@/lib/queries/assessments";

/**
 * Shell for the faculty area. Mirrors the student shell (ARCHITECTURE 7) —
 * the route group `(faculty)` only attaches this layout, it does not change
 * URLs.
 */
function navItems(
  pendingVerifications: number,
  pendingMarking: number,
): NavItem[] {
  return [
    { href: "/faculty", label: "Dashboard" },
    { href: "/faculty/students", label: "My students" },
    {
      href: "/faculty/achievements",
      label: "Achievements to verify",
      badge: pendingVerifications,
    },
    {
      href: "/faculty/assessments",
      label: "Assessments",
      badge: pendingMarking,
    },
    { href: "/faculty/events", label: "Events" },
    { href: "#", label: "Roadmap reviews", disabled: true },
  ];
}

export default async function FacultyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already confirmed role and status; this is the layout's own
  // check and the source of the faculty record the shell renders. It sends a
  // profile-less account to the blocked page rather than /login, because
  // middleware would redirect a faculty-role session straight back here and
  // the two would bounce off each other indefinitely.
  const faculty = await getOwnFaculty();
  if (!faculty) redirect("/account-blocked?reason=no-staff-record");

  // One indexed COUNT per render, so the badge cannot go stale — the same
  // trade the admin shell makes for its approvals count.
  const [pendingVerifications, pendingMarking] = await Promise.all([
    getPendingVerificationCount(),
    getPendingMarkingCount(),
  ]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <StudentNav
        items={navItems(pendingVerifications, pendingMarking)}
        studentName={faculty.fullName}
        portalSwitcher={
          <PortalSwitcher roles={faculty.roles} current="faculty" />
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-indigo-100 bg-white px-8 py-3 lg:flex">
          <p className="text-sm text-ink-faint">
            {faculty.designation} · {faculty.departmentCode} ·{" "}
            {faculty.employeeCode}
          </p>
          <LogoutButton />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
