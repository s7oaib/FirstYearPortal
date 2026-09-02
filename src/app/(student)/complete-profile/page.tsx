import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AcademicSectionForm,
  PersonalSectionForm,
  SelectionSectionForm,
} from "@/components/profile/ProfileSectionForm";
import { Card, CardBody, ProgressBar } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import {
  saveAcademicSection,
  saveDomains,
  saveGoals,
  saveInterests,
  savePersonalSection,
} from "@/lib/actions/profile";
import {
  getLookups,
  getOwnStudent,
  getProfileSnapshot,
} from "@/lib/queries/student";
import { createClient } from "@/lib/supabase/server";
import {
  computeCompletionPercent,
  evaluateSections,
} from "@/lib/profile-completion";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function CompleteProfilePage() {
  const student = await getOwnStudent();
  if (!student) redirect("/login");

  const supabase = createClient();
  const [snapshot, lookups, academicRow] = await Promise.all([
    getProfileSnapshot(student),
    getLookups(),
    supabase
      .from("student_academic_profiles")
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle(),
  ]);

  const sections = evaluateSections(snapshot);
  const percent = computeCompletionPercent(snapshot);
  const done = percent === 100;
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl text-indigo-950 sm:text-3xl">
          {done ? "Your profile is complete" : "Complete your profile"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {done
            ? "Everything required is saved. You can update any section at any time."
            : "Your dashboard unlocks once every section below is saved. You can save one section and come back later — nothing is lost."}
        </p>
      </header>

      <Card>
        <CardBody>
          <ProgressBar
            value={percent}
            label="Profile completion"
            milestones={sections.map((section) => ({
              label: section.label,
              complete: section.complete,
            }))}
          />
          {done && (
            <div className="mt-5 border-t border-indigo-100 pt-4">
              <ButtonLink href="/dashboard">Go to your dashboard</ButtonLink>
            </div>
          )}
        </CardBody>
      </Card>

      <PersonalSectionForm
        action={savePersonalSection}
        complete={byKey.identity.complete}
        defaults={{
          fullName: student.fullName ?? null,
          usn: student.usn ?? null,
          email: student.email ?? null,
          departmentName: student.departmentName ?? null,
          dob: student.dob ?? null,
          phone: student.phone ?? null,
          state: student.state ?? null,
          city: student.city ?? null,
          guardianName: student.guardianName ?? null,
          guardianPhone: student.guardianPhone ?? null,
          residenceType: student.residenceType ?? null,
        }}
      />

      <AcademicSectionForm
        action={saveAcademicSection}
        complete={byKey.academic.complete}
        defaults={{
          tenthPercentage: academicRow.data?.tenth_percentage ?? null,
          twelfthPercentage: academicRow.data?.twelfth_percentage ?? null,
          quota: academicRow.data?.quota ?? null,
          entranceRank: academicRow.data?.entrance_rank ?? null,
          semester: academicRow.data?.semester ?? null,
          section: academicRow.data?.section ?? null,
          admissionYear: academicRow.data?.admission_year ?? null,
        }}
      />

      <SelectionSectionForm
        action={saveInterests}
        title="Areas of interest"
        description="What you enjoy — inside and outside the syllabus. This shapes the events and opportunities suggested to you."
        legend="Select everything that genuinely interests you"
        options={lookups.interests}
        selected={snapshot.interestIds}
        complete={byKey.interests.complete}
      />

      <SelectionSectionForm
        action={saveGoals}
        title="Career goals"
        description="Where you'd like to end up. You can change this at any point — most first-year students do."
        legend="Select one or more goals"
        options={lookups.goals}
        selected={snapshot.goalIds}
        complete={byKey.goals.complete}
      />

      <SelectionSectionForm
        action={saveDomains}
        title="Technical domains"
        description="The technical areas you want to build depth in. Your roadmap and course recommendations are drawn from these."
        legend="Select the domains you want to work towards"
        options={lookups.domains}
        selected={snapshot.domainIds}
        complete={byKey.domains.complete}
        columns={3}
      />
    </div>
  );
}
