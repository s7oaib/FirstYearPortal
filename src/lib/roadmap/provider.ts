import "server-only";

import {
  generateRoadmap,
  type GeneratedRoadmap,
  type RoadmapInput,
} from "./generate";

/**
 * Where a roadmap comes from (PRD 5.10, ARCHITECTURE 6.3).
 *
 * The seam exists so that adding a language model later is one new file and
 * one branch in `resolveGenerator`, rather than a change threaded through the
 * action, the query, and the UI. Everything downstream reads `source`,
 * `provider`, and `model` off whatever comes back and records them with the
 * roadmap, so a mentor can always tell what produced the advice they are
 * being asked to approve.
 *
 * **The AI path is deliberately not implemented yet.** ARCHITECTURE section
 * 11 lists provider selection as an open decision, and it is a real one:
 * PRD 5.10 requires data minimisation in the prompt, and section 2 forbids
 * presenting generated advice as anything a student should follow
 * unreviewed. Writing an integration against an unchosen provider — and
 * shipping it untested, with no key to test against — would be speculative
 * code that looks finished. The rule-based generator is not a stub standing
 * in for it: it is the fallback PRD 5.10 requires to exist regardless, and it
 * works with nothing configured.
 */
export type RoadmapGenerator = {
  readonly source: "rule_based" | "ai";
  readonly provider: string | null;
  readonly model: string | null;
  generate(input: RoadmapInput): Promise<GeneratedRoadmap>;
};

export const ruleBasedGenerator: RoadmapGenerator = {
  source: "rule_based",
  provider: null,
  model: null,
  async generate(input) {
    return generateRoadmap(input);
  },
};

/**
 * Picks the generator to use for this request.
 *
 * Returns the rule-based one whenever no provider is configured, which today
 * is always. When a provider is added, this is where it goes — and it must
 * still fall back rather than throw, because PRD 5.10 is explicit that the
 * roadmap feature must never simply fail.
 */
export function resolveGenerator(): RoadmapGenerator {
  return ruleBasedGenerator;
}

/**
 * Generates, falling back if anything goes wrong.
 *
 * Wrapping the call rather than trusting each generator to handle its own
 * failure means a future provider cannot accidentally take the feature down
 * by throwing on a timeout — the requirement is that a student always gets a
 * roadmap, and this is the line that keeps it true.
 */
export async function generateWithFallback(
  input: RoadmapInput,
): Promise<{ roadmap: GeneratedRoadmap; generator: RoadmapGenerator }> {
  const generator = resolveGenerator();

  if (generator.source === "rule_based") {
    return { roadmap: await generator.generate(input), generator };
  }

  try {
    return { roadmap: await generator.generate(input), generator };
  } catch {
    return {
      roadmap: await ruleBasedGenerator.generate(input),
      generator: ruleBasedGenerator,
    };
  }
}
