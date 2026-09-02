import { describe, expect, it } from "vitest";
import {
  explain,
  matchResource,
  recommendResources,
  type ResourceForMatching,
  type StudentProfileForMatching,
} from "../recommend";

const student: StudentProfileForMatching = {
  departmentCode: "AIML",
  semester: 1,
  interestIds: [1, 2],
  goalIds: [3],
  domainIds: [4, 5],
};

const resource = (
  over: Partial<ResourceForMatching> & { id: string },
): ResourceForMatching => ({
  departmentCode: null,
  semester: null,
  interestIds: [],
  goalIds: [],
  domainIds: [],
  isVerified: false,
  ...over,
});

describe("matchResource", () => {
  it("returns null when nothing connects the two", () => {
    // An untagged resource is one nobody finished curating. Recommending it
    // to everyone would make the explanation "because it exists".
    expect(matchResource(resource({ id: "r1" }), student)).toBeNull();
  });

  it("matches on a shared career goal and says so", () => {
    const match = matchResource(resource({ id: "r1", goalIds: [3] }), student);
    expect(match).not.toBeNull();
    expect(match?.reasons).toEqual([{ kind: "goal", id: 3 }]);
  });

  it("ignores tags the student did not choose", () => {
    const match = matchResource(
      resource({ id: "r1", goalIds: [3, 99], interestIds: [42] }),
      student,
    );
    expect(match?.reasons).toEqual([{ kind: "goal", id: 3 }]);
  });

  it("matches the department only when it is set on both", () => {
    expect(
      matchResource(resource({ id: "r1", departmentCode: "AIML" }), student)
        ?.reasons,
    ).toEqual([{ kind: "department", id: null }]);

    expect(
      matchResource(resource({ id: "r2", departmentCode: "CSE" }), student),
    ).toBeNull();

    // A resource with no department is for everyone, which is not by itself
    // a reason to recommend it to anyone.
    expect(
      matchResource(resource({ id: "r3", departmentCode: null }), student),
    ).toBeNull();
  });

  it("does not match a semester the student has no value for", () => {
    const noSemester = { ...student, semester: null };
    expect(
      matchResource(resource({ id: "r1", semester: 1 }), noSemester),
    ).toBeNull();
  });

  it("collects every reason that applies", () => {
    const match = matchResource(
      resource({
        id: "r1",
        departmentCode: "AIML",
        semester: 1,
        interestIds: [1],
        goalIds: [3],
        domainIds: [4],
      }),
      student,
    );
    expect(match?.reasons).toHaveLength(5);
  });

  it("ranks a goal above a domain above an interest", () => {
    const goal = matchResource(resource({ id: "a", goalIds: [3] }), student);
    const domain = matchResource(resource({ id: "b", domainIds: [4] }), student);
    const interest = matchResource(
      resource({ id: "c", interestIds: [1] }),
      student,
    );

    expect(goal!.score).toBeGreaterThan(domain!.score);
    expect(domain!.score).toBeGreaterThan(interest!.score);
  });

  it("breaks ties towards a verified resource without excluding the rest", () => {
    const unverified = matchResource(
      resource({ id: "a", goalIds: [3] }),
      student,
    );
    const verified = matchResource(
      resource({ id: "b", goalIds: [3], isVerified: true }),
      student,
    );

    expect(verified!.score).toBeGreaterThan(unverified!.score);
    // The unverified one still matched — it is ordered lower, not hidden.
    expect(unverified).not.toBeNull();
  });
});

describe("recommendResources", () => {
  it("orders by closeness of match", () => {
    const ranked = recommendResources(
      [
        resource({ id: "weak", interestIds: [1] }),
        resource({ id: "strong", goalIds: [3], domainIds: [4] }),
        resource({ id: "middle", domainIds: [5] }),
      ],
      student,
    );

    expect(ranked.map((r) => r.resourceId)).toEqual([
      "strong",
      "middle",
      "weak",
    ]);
  });

  it("drops everything that does not match", () => {
    const ranked = recommendResources(
      [resource({ id: "no" }), resource({ id: "yes", goalIds: [3] })],
      student,
    );
    expect(ranked.map((r) => r.resourceId)).toEqual(["yes"]);
  });

  it("is stable — the same input gives the same order", () => {
    // A list that reshuffles between page loads reads as arbitrary, which
    // undermines the explanation attached to each row.
    const catalogue = [
      resource({ id: "b", goalIds: [3] }),
      resource({ id: "a", goalIds: [3] }),
      resource({ id: "c", goalIds: [3] }),
    ];
    const first = recommendResources(catalogue, student).map((r) => r.resourceId);
    const second = recommendResources([...catalogue].reverse(), student).map(
      (r) => r.resourceId,
    );
    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b", "c"]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      resource({ id: `r${i}`, goalIds: [3] }),
    );
    expect(recommendResources(many, student, 5)).toHaveLength(5);
  });

  it("returns nothing for an empty catalogue", () => {
    expect(recommendResources([], student)).toEqual([]);
  });
});

describe("explain", () => {
  const LABELS: Record<string, string> = {
    "goal:3": "GATE / Higher studies",
    "domain:4": "AI & ML",
    "interest:1": "Programming",
  };
  const names = (kind: string, id: number) => LABELS[`${kind}:${id}`] ?? null;

  it("writes a sentence a student would recognise", () => {
    const lines = explain(
      [
        { kind: "goal", id: 3 },
        { kind: "domain", id: 4 },
        { kind: "interest", id: 1 },
        { kind: "department", id: null },
        { kind: "semester", id: null },
      ],
      (kind, id) => names(kind, id),
    );

    expect(lines).toEqual([
      "Supports your goal: GATE / Higher studies",
      "In a domain you chose: AI & ML",
      "Matches an interest: Programming",
      "Matches your department",
      "Set for your semester",
    ]);
  });

  it("drops a reason it cannot name rather than printing an id", () => {
    // "Matches an interest: #7" is not an explanation.
    const lines = explain([{ kind: "interest", id: 7 }], () => null);
    expect(lines).toEqual([]);
  });

  it("returns nothing for no reasons", () => {
    expect(explain([], () => "x")).toEqual([]);
  });
});
