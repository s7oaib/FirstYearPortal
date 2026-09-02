import { redirect } from "next/navigation";
import { StudentNav, type NavItem } from "@/components/layout/StudentNav";
import { PortalSwitcher } from "@/components/layout/PortalSwitcher";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getOwnAdmin, getPendingCount } from "@/lib/queries/admin";
import { getViewer } from "@/lib/queries/roles";
import { getUnverifiedResourceCount } from "@/lib/queries/resources";

function navItems(
  pendingCount: number,
  uncheckedResources: number,
): NavItem[] {
  return [
    { href: "/admin", label: "Overview" },
    { href: "/admin/students", label: "All students" },
    {
      href: "/admin/accounts",
      label: "Account approvals",
      badge: pendingCount,
    },
    { href: "/admin/assignments", label: "Faculty assignments" },
    { href: "/admin/departments", label: "Departments" },
    {
      href: "/admin/resources",
      label: "Resources",
      badge: uncheckedResources,
    },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/audit", label: "Audit log" },
    { href: "/notifications", label: "Notifications" },
  ];
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware has already checked role and status. This is the layout's own
  // independent check — and it fails closed if the admins row is missing,
  // which is the state a user promoted in the DB but never given an admin
  // profile would be in.
  // Redirects to the blocked page rather than /login: middleware sends an
  // admin-role session straight back to /admin, so /login here would be an
  // endless bounce between the two.
  const admin = await getOwnAdmin();
  if (!admin) redirect("/account-blocked?reason=no-staff-record");

  // Counted on every admin page render so the badge is never stale — it is a
  // single indexed COUNT, and a stale approval badge is worse than useless.
  const [pendingCount, viewer, uncheckedResources] = await Promise.all([
    getPendingCount(),
    getViewer(),
    getUnverifiedResourceCount(),
  ]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <StudentNav
        items={navItems(pendingCount, uncheckedResources)}
        studentName={admin.fullName}
        portalSwitcher={
          <PortalSwitcher roles={viewer?.roles ?? []} current="admin" />
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-indigo-100 bg-white px-8 py-3 lg:flex">
          <p className="text-sm text-ink-faint">
            {admin.designation} · {admin.employeeCode}
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
