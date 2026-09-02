import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { branding } from "@/config/branding";

/**
 * Two-column shell for the auth pages: the form on the left with a fixed
 * comfortable measure, an editorial panel on the right that collapses away
 * below `lg` so small screens get the form and nothing competing with it.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: { heading: string; points: string[] };
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <Link href="/" className="inline-flex w-fit rounded-lg">
          <Logo />
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <header className="mb-7">
            <h1 className="text-3xl text-indigo-950 sm:text-[2rem]">{title}</h1>
            {subtitle && (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {subtitle}
              </p>
            )}
          </header>

          {children}

          {footer && (
            <div className="mt-6 border-t border-indigo-100 pt-5 text-sm text-ink-muted">
              {footer}
            </div>
          )}
        </div>

        <p className="text-xs text-ink-faint">
          © {new Date().getFullYear()} {branding.institution.name}
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-indigo-950 lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #f0d798 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brass-300">
            {branding.institution.shortName} · {branding.product.tagline}
          </p>
          <h2 className="max-w-sm text-3xl leading-tight text-parchment">
            {aside?.heading ??
              "Everything you need to thrive in your first year."}
          </h2>
          <ul className="mt-8 space-y-4">
            {(
              aside?.points ?? [
                "Track your academic milestones, skills, and certifications in one place.",
                "Connect seamlessly with mentors and faculty for timely guidance.",
                "Access curated opportunities, events, and a personalized roadmap.",
              ]
            ).map((point) => (
              <li key={point} className="flex gap-3 text-sm text-indigo-100">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brass-400"
                />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-10 max-w-sm text-xs leading-relaxed text-indigo-300">
            {branding.institution.affiliation}
          </p>
        </div>
      </aside>
    </div>
  );
}
