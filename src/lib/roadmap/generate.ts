/**
 * Rule-based roadmap generation (PRD 5.10).
 *
 * This is the fallback the PRD requires — "the roadmap feature must never
 * simply fail" — and it is deliberately the primary implementation rather
 * than an emergency path. It is deterministic, explainable, and it works with
 * no AI provider configured at all.
 *
 * Two rules govern everything here:
 *
 *   1. Every milestone carries a rationale drawn from something the student
 *      actually entered. PRD 5.10 requires a roadmap to show which inputs
 *      drove each recommendation, so `rationale` is a required field rather
 *      than a nicety, and there is no code path that produces a milestone
 *      without one.
 *
 *   2. Nothing here invents a fact about the world. No course names, no
 *      certification titles, no URLs, no salary figures, no claims about what
 *      employers want. Those are exactly the things a generator is tempted to
 *      fabricate and a first-year student has no way to check. Milestones are
 *      actions the student can take; concrete resources come from the
 *      admin-verified catalogue (PRD 5.9), where a person vouched for them.
 */

export type Horizon =
  | "thirty_days"
  | "three_to_six_months"
  | "one_to_four_years";

export type GeneratedMilestone = {
  horizon: Horizon;
  title: string;
  detail: string | null;
  /** Why this is here, in terms of the student's own profile. */
  rationale: string;
};

export type RoadmapInput = {
  departmentName: string;
  semester: number | null;
  /** Names, not ids — the rationale has to read as a sentence. */
  goals: string[];
  domains: string[];
  interests: string[];
  tenthPercentage: number | null;
  twelfthPercentage: number | null;
  /** Achievements already recorded and verified, if any. */
  verifiedAchievements: number;
};

export type GeneratedRoadmap = {
  milestones: GeneratedMilestone[];
  /** What the generator was working from, kept with the roadmap. */
  inputsSummary: string;
};

// --- Goal-specific tracks ----------------------------------------------------
//
// Keyed on the seeded `career_goals` names. A goal the portal does not
// recognise falls through to the general track rather than being ignored:
// a student who picked something unusual should still get a plan.

type Track = {
  match: (goal: string) => boolean;
  medium: Array<{ title: string; detail: string }>;
  long: Array<{ title: string; detail: string }>;
};

const TRACKS: Track[] = [
  {
    match: (g) => /IT|software/i.test(g),
    medium: [
      {
        title: "Build and finish one small project end to end",
        detail:
          "Something you can demonstrate and explain — finished and working matters more than ambitious and abandoned.",
      },
      {
        title: "Practise programming problems on a regular schedule",
        detail:
          "A fixed slot two or three times a week is worth more than occasional long sessions.",
      },
    ],
    long: [
      {
        title: "Assemble a portfolio of three or four projects you can talk through",
        detail:
          "By your final year the questions are about decisions you made, not features you listed.",
      },
      {
        title: "Complete at least one internship in a software team",
        detail: "Working inside someone else's codebase teaches what personal projects cannot.",
      },
    ],
  },
  {
    match: (g) => /core|non-IT/i.test(g),
    medium: [
      {
        title: "Get comfortable with the core software your branch uses",
        detail: "Ask your department which tools their labs and industry partners actually use.",
      },
      {
        title: "Visit or shadow one workplace in your field",
        detail: "A single site visit reshapes what the syllabus looks like.",
      },
    ],
    long: [
      {
        title: "Take on a design or fabrication project with a real constraint",
        detail: "A budget, a deadline, or a physical limit — constraints are what make it engineering.",
      },
      {
        title: "Complete an industrial internship in your branch",
        detail: "Core-sector recruitment leans heavily on demonstrated plant or workshop exposure.",
      },
    ],
  },
  {
    match: (g) => /GATE|higher studies/i.test(g),
    medium: [
      {
        title: "Build a strong foundation in your core subjects rather than starting exam prep",
        detail:
          "GATE rewards understanding of the same fundamentals your first two years cover. Depth now saves a year of revision later.",
      },
      {
        title: "Keep organised notes you can revise from in your final year",
        detail: "Your third-year self will thank you for legible first-year notes.",
      },
    ],
    long: [
      {
        title: "Begin structured preparation from your third year",
        detail: "Earlier than that usually trades depth in your degree for a small head start.",
      },
      {
        title: "Work with a faculty member on something research-shaped",
        detail: "Postgraduate applications and interviews both reward it.",
      },
    ],
  },
  {
    match: (g) => /abroad|MS|MEng/i.test(g),
    medium: [
      {
        title: "Protect your CGPA from the first semester onward",
        detail:
          "Overseas admissions weigh your whole transcript, and early marks are the hardest to recover from.",
      },
      {
        title: "Find out what the countries you are considering actually require",
        detail:
          "Requirements differ sharply by country and change over time. Check official university and government pages rather than forums.",
      },
    ],
    long: [
      {
        title: "Build relationships with faculty who could write about your work",
        detail: "A recommendation is only as good as how well the writer knows you.",
      },
      {
        title: "Plan the tests and the funding timeline well before your final year",
        detail: "Both take longer than most students expect.",
      },
    ],
  },
  {
    match: (g) => /entrepreneur|startup/i.test(g),
    medium: [
      {
        title: "Talk to ten people who have the problem you want to solve",
        detail: "Before building anything. Most first ideas do not survive this, which is the point.",
      },
      {
        title: "Ship the smallest version that someone could actually use",
        detail: "Scope it to weeks, not months.",
      },
    ],
    long: [
      {
        title: "Use your college's entrepreneurship cell and mentors properly",
        detail: "Ask what support exists before you need it.",
      },
      {
        title: "Learn enough finance and law to know what you do not know",
        detail: "Enough to ask a professional the right question.",
      },
    ],
  },
  {
    match: (g) => /government|PSU|civil services/i.test(g),
    medium: [
      {
        title: "Build a steady general-awareness habit now",
        detail: "Fifteen minutes daily compounds far better than weekend cramming.",
      },
      {
        title: "Keep your academic record strong",
        detail: "Several public-sector routes screen on marks before anything else.",
      },
    ],
    long: [
      {
        title: "Understand the exact eligibility and format of the routes you are aiming at",
        detail: "Check official notifications rather than coaching summaries.",
      },
      {
        title: "Decide when to commit to full-time preparation",
        detail: "It is a real trade-off against placements, and worth deciding deliberately.",
      },
    ],
  },
  {
    match: (g) => /research|academia/i.test(g),
    medium: [
      {
        title: "Read one paper a month in an area you find interesting",
        detail: "You will not understand all of it at first. That is normal and it passes.",
      },
      {
        title: "Ask a faculty member what they are working on",
        detail: "Most are glad to be asked, and first-year students rarely ask.",
      },
    ],
    long: [
      {
        title: "Contribute to a real project under a faculty member",
        detail: "Even a small part of a larger effort teaches how research actually proceeds.",
      },
      {
        title: "Aim to write something up, however short",
        detail: "Writing is where you discover what you did not understand.",
      },
    ],
  },
];

const GENERAL_TRACK: Pick<Track, "medium" | "long"> = {
  medium: [
    {
      title: "Try one activity outside your syllabus each term",
      detail: "A club, a competition, a workshop — first year is the cheapest time to find out what suits you.",
    },
  ],
  long: [
    {
      title: "Revisit this plan once you have chosen a direction",
      detail: "A roadmap written before you know what you want is a starting point, not a commitment.",
    },
  ],
};

// --- Generation --------------------------------------------------------------

function trackFor(goal: string): Pick<Track, "medium" | "long"> {
  return TRACKS.find((t) => t.match(goal)) ?? GENERAL_TRACK;
}

/**
 * Builds a roadmap from a student's profile.
 *
 * Always returns at least one milestone in each horizon. A plan with an empty
 * section reads as broken rather than sparse, and a student with a thin
 * profile is precisely the one who needs the "go and fill this in" nudge.
 */
export function generateRoadmap(input: RoadmapInput): GeneratedRoadmap {
  const milestones: GeneratedMilestone[] = [];

  // --- 30 days: things that are true regardless of direction ---------------
  if (input.goals.length === 0) {
    milestones.push({
      horizon: "thirty_days",
      title: "Add your career goals to your profile",
      detail:
        "Everything else in this plan is generic until the portal knows what you are aiming at.",
      rationale: "You have not recorded any career goals yet.",
    });
  } else {
    milestones.push({
      horizon: "thirty_days",
      title: `Write down what "${input.goals[0]}" means to you in three sentences`,
      detail:
        "Being able to say it plainly is the difference between a goal and a label.",
      rationale: `You chose "${input.goals[0]}" as a career goal.`,
    });
  }

  if (input.domains.length > 0) {
    milestones.push({
      horizon: "thirty_days",
      title: `Spend four hours on an introduction to ${input.domains[0]}`,
      detail:
        "Enough to find out whether you enjoy it before committing a term to it.",
      rationale: `You listed ${input.domains[0]} as a technical domain you are interested in.`,
    });
  } else {
    milestones.push({
      horizon: "thirty_days",
      title: "Pick two technical domains to explore and add them to your profile",
      detail: "You are not committing to anything — you are narrowing from everything.",
      rationale: "You have not recorded any technical domains yet.",
    });
  }

  milestones.push({
    horizon: "thirty_days",
    title: "Introduce yourself to one faculty member in your department",
    detail:
      "Office hours exist and are mostly empty. The first conversation is the hard one.",
    rationale: `You are in ${input.departmentName}.`,
  });

  // A student arriving with weaker school marks is the one most likely to
  // quietly fall behind in the first year, and the least likely to ask. This
  // is phrased as support rather than a verdict — a percentage is not a
  // prediction, and must not be presented as one.
  const weakest = [input.tenthPercentage, input.twelfthPercentage].filter(
    (v): v is number => typeof v === "number",
  );
  if (weakest.length > 0 && Math.min(...weakest) < 60) {
    milestones.push({
      horizon: "thirty_days",
      title: "Book a session with your mentor about study habits",
      detail:
        "Ask specifically about how to approach the subjects you find hardest this semester.",
      rationale:
        "Your recorded school marks suggest the first-year jump may be a steep one — this is about support, not a judgement.",
    });
  }

  // --- 3–6 months: goal-driven ---------------------------------------------
  const goalsToUse = input.goals.length > 0 ? input.goals.slice(0, 2) : [""];
  for (const goal of goalsToUse) {
    const track = goal ? trackFor(goal) : GENERAL_TRACK;
    for (const item of track.medium) {
      milestones.push({
        horizon: "three_to_six_months",
        title: item.title,
        detail: item.detail,
        rationale: goal
          ? `Follows from your goal: ${goal}.`
          : "A general step, because you have not set a career goal yet.",
      });
    }
  }

  if (input.interests.length > 0) {
    milestones.push({
      horizon: "three_to_six_months",
      title: `Join or start something around ${input.interests[0]}`,
      detail:
        "A club, a team, or two other people who care about it. Interests survive first year only if they are shared.",
      rationale: `You listed ${input.interests[0]} among your interests.`,
    });
  }

  if (input.verifiedAchievements === 0) {
    milestones.push({
      horizon: "three_to_six_months",
      title: "Record your first achievement in the portal and get it verified",
      detail:
        "Certificates, competitions, and volunteering all count. Recording them as they happen is far easier than reconstructing them in your final year.",
      rationale: "You have no verified achievements recorded yet.",
    });
  }

  // --- 1–4 years: goal-driven ----------------------------------------------
  for (const goal of goalsToUse) {
    const track = goal ? trackFor(goal) : GENERAL_TRACK;
    for (const item of track.long) {
      milestones.push({
        horizon: "one_to_four_years",
        title: item.title,
        detail: item.detail,
        rationale: goal
          ? `Follows from your goal: ${goal}.`
          : "A general step, because you have not set a career goal yet.",
      });
    }
  }

  // Deduplicate: two goals on the same track would otherwise repeat every
  // milestone verbatim, which makes a plan look padded.
  const seen = new Set<string>();
  const deduped = milestones.filter((m) => {
    const key = `${m.horizon}:${m.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    milestones: deduped,
    inputsSummary: describeInputs(input),
  };
}

/**
 * The inputs, written out and stored with the roadmap.
 *
 * Kept verbatim so a mentor reviewing months later sees what the generator
 * was working from at the time, rather than what the profile has become.
 */
export function describeInputs(input: RoadmapInput): string {
  const parts = [
    `Department: ${input.departmentName}`,
    input.semester ? `Semester: ${input.semester}` : null,
    input.goals.length > 0
      ? `Career goals: ${input.goals.join(", ")}`
      : "Career goals: none recorded",
    input.domains.length > 0
      ? `Technical domains: ${input.domains.join(", ")}`
      : "Technical domains: none recorded",
    input.interests.length > 0
      ? `Interests: ${input.interests.join(", ")}`
      : "Interests: none recorded",
    input.tenthPercentage !== null ? `10th: ${input.tenthPercentage}%` : null,
    input.twelfthPercentage !== null
      ? `12th: ${input.twelfthPercentage}%`
      : null,
    `Verified achievements: ${input.verifiedAchievements}`,
  ].filter(Boolean);

  return parts.join(" · ");
}

export const HORIZONS: Horizon[] = [
  "thirty_days",
  "three_to_six_months",
  "one_to_four_years",
];

export const HORIZON_LABELS: Record<Horizon, string> = {
  thirty_days: "Next 30 days",
  three_to_six_months: "3–6 months",
  one_to_four_years: "1–4 years",
};

export function milestonesByHorizon(
  milestones: GeneratedMilestone[],
): Record<Horizon, GeneratedMilestone[]> {
  return {
    thirty_days: milestones.filter((m) => m.horizon === "thirty_days"),
    three_to_six_months: milestones.filter(
      (m) => m.horizon === "three_to_six_months",
    ),
    one_to_four_years: milestones.filter(
      (m) => m.horizon === "one_to_four_years",
    ),
  };
}
