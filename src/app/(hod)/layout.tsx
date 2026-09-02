import { redirect } from "next/navigation";
import { StudentNav, type NavItem } from "@/components/layout/StudentNav";
import { PortalSwitcher } from "@/components/layout/PortalSwitcher";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getOwnStaff } from "@/lib/queries/faculty";
import { getPendingVerificationCount } from "@/lib/queries/achievements";
import { getPendingMarkingCount } from "@/lib/queries/assessments";
import { getPendingRoadmapCount } from "@/lib/queries/roadmaps";

/**
 * Shell for the Head of Department area.
 *
 * A HOD's profile lives in the same `faculty` table as a mentor's — what
 * separates them is `users.role`, which is what every RLS policy keys off.
 * This layout checks that role independently of middleware: an account that
 * reaches `/hod` without an active staff record is sent to the blocked page
 * rather than to `/login`, because `/login` would bounce them straight back
 * here and the two would redirect at each other forever.
 */
function navItems(
  pendingVerifications: number,
  pendingMarking: number,
  pendingRoadmaps: number,
): NavItem[] {
  return [
    { href: "/hod", label: "Dashboard" },
    { href: "/hod/students", label: "Department students" },
    {
      href: "/hod/achievements",
      label: "Achievements to verify",
      badge: pendingVerifications,
    },
    {
      href: "/hod/assessments",
      label: "Assessments",
      badge: pendingMarking,
    },
    { href: "/hod/events", label: "Events" },
    {
      href: "/hod/roadmaps",
      label: "Roadmap reviews",
      badge: pendingRoadmaps,
    },
    { href: "/notifications", label: "Notifications" },
  ];
}

export default async function HodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getOwnStaff();
  if (!staff) redirect("/account-blocked?reason=no-staff-record");
  // Membership, not equality: this account may be an administrator whose
  // primary role is `admin` and who also heads a department.
  if (!staff.roles.includes("hod")) redirect("/login");

  const [pendingVerifications, pendingMarking, pendingRoadmaps] =
    await Promise.all([
      getPendingVerificationCount(),
      getPendingMarkingCount(),
      getPendingRoadmapCount(),
    ]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <StudentNav
        items={navItems(pendingVerifications, pendingMarking, pendingRoadmaps)}
        studentName={staff.fullName}
        portalSwitcher={<PortalSwitcher roles={staff.roles} current="hod" />}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-indigo-100 bg-white px-8 py-3 lg:flex">
          <p className="text-sm text-ink-faint">
            Head of Department · {staff.departmentCode} · {staff.employeeCode}
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
