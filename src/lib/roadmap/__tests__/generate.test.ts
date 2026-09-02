import { describe, expect, it } from "vitest";
import {
  HORIZONS,
  describeInputs,
  generateRoadmap,
  milestonesByHorizon,
  type RoadmapInput,
} from "../generate";

const base: RoadmapInput = {
  departmentName: "Artificial Intelligence & Machine Learning",
  semester: 1,
  goals: ["IT / Software employment"],
  domains: ["Artificial Intelligence & ML"],
  interests: ["Programming"],
  tenthPercentage: 85,
  twelfthPercentage: 80,
  verifiedAchievements: 0,
};

describe("generateRoadmap — the guarantees", () => {
  it("never produces a milestone without a rationale", () => {
    // PRD 5.10 requires every recommendation to show what drove it, and the
    // database column is NOT NULL. A generator path that skipped it would
    // fail at insert time in front of a mentor.
    const inputs: RoadmapInput[] = [
      base,
      { ...base, goals: [], domains: [], interests: [] },
      { ...base, goals: ["Something the portal has never heard of"] },
      { ...base, tenthPercentage: null, twelfthPercentage: null },
    ];

    for (const input of inputs) {
      for (const m of generateRoadmap(input).milestones) {
        expect(m.rationale.trim().length).toBeGreaterThan(2);
        expect(m.title.trim().length).toBeGreaterThan(2);
      }
    }
  });

  it("fills every horizon, even for an empty profile", () => {
    // A plan with an empty section reads as broken rather than sparse — and a
    // student with a thin profile is exactly who needs the nudge.
    const empty: RoadmapInput = {
      departmentName: "Mechanical Engineering",
      semester: null,
      goals: [],
      domains: [],
      interests: [],
      tenthPercentage: null,
      twelfthPercentage: null,
      verifiedAchievements: 0,
    };

    const grouped = milestonesByHorizon(generateRoadmap(empty).milestones);
    for (const horizon of HORIZONS) {
      expect(grouped[horizon].length, `${horizon} was empty`).toBeGreaterThan(0);
    }
  });

  it("is deterministic — the same profile gives the same plan", () => {
    const a = generateRoadmap(base);
    const b = generateRoadmap(base);
    expect(a).toEqual(b);
  });

  it("does not fail on an unrecognised goal", () => {
    // A student who typed something unusual should still get a plan.
    const odd = generateRoadmap({ ...base, goals: ["Underwater basket weaving"] });
    expect(odd.milestones.length).toBeGreaterThan(0);
    const grouped = milestonesByHorizon(odd.milestones);
    expect(grouped.one_to_four_years.length).toBeGreaterThan(0);
  });
});

describe("generateRoadmap — rationales point at real inputs", () => {
  it("names the goal it derived a milestone from", () => {
    const plan = generateRoadmap(base);
    const derived = plan.milestones.filter((m) =>
      m.rationale.includes("IT / Software employment"),
    );
    expect(derived.length).toBeGreaterThan(0);
  });

  it("names the domain it used", () => {
    const plan = generateRoadmap(base);
    expect(
      plan.milestones.some((m) =>
        m.rationale.includes("Artificial Intelligence & ML"),
      ),
    ).toBe(true);
  });

  it("tells a student with no goals that this is why the plan is generic", () => {
    const plan = generateRoadmap({ ...base, goals: [] });
    expect(
      plan.milestones.some((m) =>
        /have not recorded any career goals/i.test(m.rationale),
      ),
    ).toBe(true);
  });

  it("mentions the department somewhere", () => {
    const plan = generateRoadmap(base);
    expect(
      plan.milestones.some((m) => m.rationale.includes(base.departmentName)),
    ).toBe(true);
  });
});

describe("generateRoadmap — goal tracks", () => {
  const titlesFor = (goal: string) =>
    generateRoadmap({ ...base, goals: [goal] }).milestones.map((m) => m.title);

  it("gives different advice for different goals", () => {
    const it = titlesFor("IT / Software employment");
    const gate = titlesFor("GATE / Higher studies in India");
    const abroad = titlesFor("Study abroad (MS / MEng)");

    expect(it).not.toEqual(gate);
    expect(gate).not.toEqual(abroad);
  });

  it("does not tell a GATE aspirant to start exam prep in first year", () => {
    // Deliberate: the advice is to build fundamentals, because starting
    // coaching in first year trades degree depth for a small head start.
    const gate = generateRoadmap({
      ...base,
      goals: ["GATE / Higher studies in India"],
    });
    expect(
      gate.milestones.some((m) =>
        /foundation in your core subjects rather than starting exam prep/i.test(
          m.title,
        ),
      ),
    ).toBe(true);
  });

  it("does not repeat identical milestones when two goals share a track", () => {
    const plan = generateRoadmap({
      ...base,
      goals: ["GATE / Higher studies in India", "Research & Academia"],
    });
    const keys = plan.milestones.map((m) => `${m.horizon}:${m.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses at most the first two goals, so a plan stays actionable", () => {
    const many = generateRoadmap({
      ...base,
      goals: [
        "IT / Software employment",
        "Study abroad (MS / MEng)",
        "Entrepreneurship / Startup",
        "Civil services",
      ],
    });
    expect(
      many.milestones.some((m) => m.rationale.includes("Civil services")),
    ).toBe(false);
  });
});

describe("generateRoadmap — support, not verdicts", () => {
  it("offers help when school marks were low, without predicting an outcome", () => {
    const plan = generateRoadmap({
      ...base,
      tenthPercentage: 52,
      twelfthPercentage: 58,
    });
    const nudge = plan.milestones.find((m) =>
      /session with your mentor/i.test(m.title),
    );

    expect(nudge).toBeDefined();
    // The wording must not imply a forecast — a percentage is not a
    // prediction and this portal must not present one as such.
    expect(nudge!.rationale).toMatch(/support, not a judgement/i);
    expect(nudge!.rationale).not.toMatch(/will (fail|struggle)|likely to/i);
  });

  it("does not add that milestone for solid marks", () => {
    const plan = generateRoadmap(base);
    expect(
      plan.milestones.some((m) => /session with your mentor/i.test(m.title)),
    ).toBe(false);
  });

  it("does not add it when no marks are recorded", () => {
    // Absent data is not evidence of a problem.
    const plan = generateRoadmap({
      ...base,
      tenthPercentage: null,
      twelfthPercentage: null,
    });
    expect(
      plan.milestones.some((m) => /session with your mentor/i.test(m.title)),
    ).toBe(false);
  });
});

describe("generateRoadmap — invents nothing", () => {
  it("contains no URLs", () => {
    // Concrete resources come from the admin-verified catalogue (PRD 5.9),
    // where a person vouched for them. A generator inventing links is the
    // exact failure mode that section exists to prevent.
    const plan = generateRoadmap(base);
    for (const m of plan.milestones) {
      const text = `${m.title} ${m.detail ?? ""} ${m.rationale}`;
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/www\./);
    }
  });

  it("names no specific course, certification, or company", () => {
    const plan = generateRoadmap(base);
    const text = plan.milestones
      .map((m) => `${m.title} ${m.detail ?? ""}`)
      .join(" ");

    for (const invented of [
      "NPTEL",
      "Coursera",
      "Udemy",
      "AWS Certified",
      "Google",
      "Microsoft",
      "TCS",
      "Infosys",
    ]) {
      expect(text).not.toContain(invented);
    }
  });

  it("quotes no salary, ranking, or placement statistic", () => {
    const plan = generateRoadmap(base);
    const text = plan.milestones
      .map((m) => `${m.title} ${m.detail ?? ""} ${m.rationale}`)
      .join(" ");

    expect(text).not.toMatch(/LPA|lakh|package|₹|\$\d/i);
    expect(text).not.toMatch(/\d+%\s*(of|placement|students get)/i);
  });
});

describe("describeInputs", () => {
  it("records what the generator was working from", () => {
    const summary = describeInputs(base);
    expect(summary).toContain("Artificial Intelligence & Machine Learning");
    expect(summary).toContain("IT / Software employment");
    expect(summary).toContain("Verified achievements: 0");
  });

  it("says plainly when something was not recorded", () => {
    const summary = describeInputs({
      ...base,
      goals: [],
      domains: [],
      interests: [],
    });
    expect(summary).toContain("Career goals: none recorded");
    expect(summary).toContain("Technical domains: none recorded");
  });

  it("omits marks that were never entered rather than reporting zero", () => {
    const summary = describeInputs({
      ...base,
      tenthPercentage: null,
      twelfthPercentage: null,
    });
    expect(summary).not.toContain("10th:");
    expect(summary).not.toContain("0%");
  });
});
