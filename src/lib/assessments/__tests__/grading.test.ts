import { describe, expect, it } from "vitest";
import {
  availability,
  finaliseAttempt,
  gradeAttempt,
  gradeQuestion,
  type GradableQuestion,
} from "../grading";

const single = (correctId: string, points = 1): GradableQuestion => ({
  id: "q1",
  kind: "single_choice",
  points,
  options: [
    { id: "a", isCorrect: correctId === "a", scoreValue: 0 },
    { id: "b", isCorrect: correctId === "b", scoreValue: 0 },
    { id: "c", isCorrect: correctId === "c", scoreValue: 0 },
  ],
});

const multi = (correctIds: string[], points = 2): GradableQuestion => ({
  id: "q2",
  kind: "multiple_choice",
  points,
  options: ["a", "b", "c", "d"].map((id) => ({
    id,
    isCorrect: correctIds.includes(id),
    scoreValue: 0,
  })),
});

const longAnswer: GradableQuestion = {
  id: "q3",
  kind: "long_answer",
  points: 10,
  options: [],
};

const likert: GradableQuestion = {
  id: "q4",
  kind: "likert",
  points: 5,
  options: [
    { id: "l1", isCorrect: null, scoreValue: 1 },
    { id: "l2", isCorrect: null, scoreValue: 3 },
    { id: "l3", isCorrect: null, scoreValue: 5 },
  ],
};

describe("gradeQuestion — single choice", () => {
  it("awards full points for the correct option", () => {
    const out = gradeQuestion(single("b"), {
      questionId: "q1",
      selectedOptionIds: ["b"],
      textAnswer: null,
    });
    expect(out.awardedPoints).toBe(1);
    expect(out.autoMarked).toBe(true);
  });

  it("awards nothing for the wrong option", () => {
    const out = gradeQuestion(single("b"), {
      questionId: "q1",
      selectedOptionIds: ["a"],
      textAnswer: null,
    });
    expect(out.awardedPoints).toBe(0);
  });

  it("scores an unanswered question zero, marked", () => {
    // Zero rather than null: it was marked, and the mark is nil. Returning
    // null would hold the whole attempt open waiting for a human to mark a
    // question nobody answered.
    const out = gradeQuestion(single("b"), undefined);
    expect(out.awardedPoints).toBe(0);
    expect(out.autoMarked).toBe(true);
  });
});

describe("gradeQuestion — multiple choice", () => {
  it("requires every correct option and no incorrect one", () => {
    const q = multi(["a", "c"]);
    const pick = (ids: string[]) =>
      gradeQuestion(q, { questionId: "q2", selectedOptionIds: ids, textAnswer: null })
        .awardedPoints;

    expect(pick(["a", "c"])).toBe(2);
    expect(pick(["a"])).toBe(0); // incomplete
    expect(pick(["a", "c", "d"])).toBe(0); // one wrong spoils it
    expect(pick(["b", "d"])).toBe(0);
  });

  it("does not care about selection order", () => {
    const q = multi(["a", "c"]);
    const out = gradeQuestion(q, {
      questionId: "q2",
      selectedOptionIds: ["c", "a"],
      textAnswer: null,
    });
    expect(out.awardedPoints).toBe(2);
  });
});

describe("gradeQuestion — subjective", () => {
  it("returns null rather than zero for a long answer", () => {
    // "Not marked yet" and "marked, worth nothing" are different claims.
    // Collapsing them shows a student a failing score for unread work.
    const out = gradeQuestion(longAnswer, {
      questionId: "q3",
      selectedOptionIds: [],
      textAnswer: "An essay.",
    });
    expect(out.awardedPoints).toBeNull();
    expect(out.autoMarked).toBe(false);
    expect(out.maxPoints).toBe(10);
  });

  it("still returns null when nothing was written", () => {
    const out = gradeQuestion(longAnswer, undefined);
    expect(out.awardedPoints).toBeNull();
  });
});

describe("gradeQuestion — likert", () => {
  it("sums the scale values of the chosen options", () => {
    const out = gradeQuestion(likert, {
      questionId: "q4",
      selectedOptionIds: ["l2"],
      textAnswer: null,
    });
    expect(out.awardedPoints).toBe(3);
    expect(out.autoMarked).toBe(true);
  });

  it("scores nothing when unanswered, without blocking the attempt", () => {
    const out = gradeQuestion(likert, undefined);
    expect(out.awardedPoints).toBe(0);
    expect(out.autoMarked).toBe(true);
  });
});

describe("gradeQuestion — authoring mistakes", () => {
  it("sends a question with no correct option to a human", () => {
    // Marking everyone zero would punish students for the author's error.
    const broken: GradableQuestion = {
      id: "qx",
      kind: "single_choice",
      points: 1,
      options: [
        { id: "a", isCorrect: false, scoreValue: 0 },
        { id: "b", isCorrect: null, scoreValue: 0 },
      ],
    };
    const out = gradeQuestion(broken, {
      questionId: "qx",
      selectedOptionIds: ["a"],
      textAnswer: null,
    });
    expect(out.awardedPoints).toBeNull();
    expect(out.autoMarked).toBe(false);
  });
});

describe("gradeAttempt", () => {
  it("scores a fully objective paper and applies the pass mark", () => {
    const result = gradeAttempt(
      [single("b"), multi(["a", "c"])],
      [
        { questionId: "q1", selectedOptionIds: ["b"], textAnswer: null },
        { questionId: "q2", selectedOptionIds: ["a", "c"], textAnswer: null },
      ],
      50,
    );

    expect(result.score).toBe(3);
    expect(result.maxScore).toBe(3);
    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.needsManualMarking).toBe(false);
  });

  it("fails an attempt below the pass mark", () => {
    const result = gradeAttempt(
      [single("b"), multi(["a", "c"])],
      [
        { questionId: "q1", selectedOptionIds: ["a"], textAnswer: null },
        { questionId: "q2", selectedOptionIds: ["a", "c"], textAnswer: null },
      ],
      80,
    );
    expect(result.percentage).toBeCloseTo(66.67, 1);
    expect(result.passed).toBe(false);
  });

  it("withholds the percentage while any answer is unmarked", () => {
    // A student shown "23%" on a paper half of which nobody has read has
    // been told something false.
    const result = gradeAttempt(
      [single("b"), longAnswer],
      [
        { questionId: "q1", selectedOptionIds: ["b"], textAnswer: null },
        { questionId: "q3", selectedOptionIds: [], textAnswer: "Essay." },
      ],
      50,
    );

    expect(result.needsManualMarking).toBe(true);
    expect(result.percentage).toBeNull();
    expect(result.passed).toBeNull();
    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(11);
  });

  it("leaves passed null when no pass mark was set", () => {
    const result = gradeAttempt(
      [single("b")],
      [{ questionId: "q1", selectedOptionIds: ["b"], textAnswer: null }],
      null,
    );
    expect(result.percentage).toBe(100);
    expect(result.passed).toBeNull();
  });

  it("does not divide by zero on an empty paper", () => {
    const result = gradeAttempt([], [], 50);
    expect(result.maxScore).toBe(0);
    expect(result.percentage).toBeNull();
    expect(result.score).toBe(0);
  });

  it("ignores answers to questions that are not on the paper", () => {
    const result = gradeAttempt(
      [single("b")],
      [
        { questionId: "q1", selectedOptionIds: ["b"], textAnswer: null },
        { questionId: "ghost", selectedOptionIds: ["z"], textAnswer: null },
      ],
      null,
    );
    expect(result.maxScore).toBe(1);
    expect(result.score).toBe(1);
  });
});

describe("finaliseAttempt", () => {
  it("computes the final percentage once a human has marked", () => {
    const result = finaliseAttempt(
      [
        { awardedPoints: 1, maxPoints: 1 },
        { awardedPoints: 7, maxPoints: 10 },
      ],
      50,
    );
    expect(result.score).toBe(8);
    expect(result.maxScore).toBe(11);
    expect(result.percentage).toBeCloseTo(72.73, 1);
    expect(result.passed).toBe(true);
    expect(result.needsManualMarking).toBe(false);
  });

  it("stays incomplete while one mark is still missing", () => {
    const result = finaliseAttempt(
      [
        { awardedPoints: 1, maxPoints: 1 },
        { awardedPoints: null, maxPoints: 10 },
      ],
      50,
    );
    expect(result.needsManualMarking).toBe(true);
    expect(result.percentage).toBeNull();
  });

  it("treats a zero mark as marked, not as missing", () => {
    const result = finaliseAttempt(
      [{ awardedPoints: 0, maxPoints: 5 }],
      50,
    );
    expect(result.needsManualMarking).toBe(false);
    expect(result.percentage).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe("availability", () => {
  const base = {
    isPublished: true,
    opensAt: null as string | null,
    closesAt: null as string | null,
    maxAttempts: 2,
  };
  const now = new Date("2026-08-18T10:00:00Z");

  it("is open for a published paper inside its window", () => {
    expect(availability(base, 0, now)).toEqual({ open: true });
  });

  it("is closed while unpublished", () => {
    expect(availability({ ...base, isPublished: false }, 0, now)).toEqual({
      open: false,
      reason: "not_published",
    });
  });

  it("is closed before it opens", () => {
    expect(
      availability({ ...base, opensAt: "2026-08-19T00:00:00Z" }, 0, now),
    ).toEqual({ open: false, reason: "not_yet_open" });
  });

  it("is closed after it closes", () => {
    expect(
      availability({ ...base, closesAt: "2026-08-17T00:00:00Z" }, 0, now),
    ).toEqual({ open: false, reason: "closed" });
  });

  it("closes exactly at the closing instant, not after it", () => {
    expect(
      availability({ ...base, closesAt: "2026-08-18T10:00:00Z" }, 0, now),
    ).toEqual({ open: false, reason: "closed" });
  });

  it("refuses once attempts are used up", () => {
    expect(availability(base, 2, now)).toEqual({
      open: false,
      reason: "no_attempts_left",
    });
    expect(availability(base, 1, now)).toEqual({ open: true });
  });

  it("reports the earliest reason when several apply", () => {
    // Publication is the author's state; the window and attempt count are
    // the student's. Leading with "not published" avoids telling a student
    // they are out of attempts on a paper that does not exist for them yet.
    expect(
      availability(
        { ...base, isPublished: false, closesAt: "2026-08-17T00:00:00Z" },
        5,
        now,
      ),
    ).toEqual({ open: false, reason: "not_published" });
  });
});
