import { redirect } from "next/navigation";
import { StudentNav, type NavItem } from "@/components/layout/StudentNav";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getOwnStudent } from "@/lib/queries/student";

/**
 * Shell for the student area. The route group `(student)` does not affect
 * URLs — `/dashboard` stays `/dashboard` — it exists only to attach this
 * layout (ARCHITECTURE section 7).
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/complete-profile", label: "My profile" },
  { href: "/achievements", label: "Achievements" },
  { href: "/assessments", label: "Assessments" },
  { href: "/events", label: "Events" },
  { href: "#", label: "Resources", disabled: true },
  { href: "#", label: "My roadmap", disabled: true },
];

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already gated this route; this is the layout's own
  // independent check, and the source of the student record the shell needs.
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <StudentNav items={NAV_ITEMS} studentName={student.fullName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-indigo-100 bg-white px-8 py-3 lg:flex">
          <p className="text-sm text-ink-faint">
            {student.departmentName} · {student.usn}
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
