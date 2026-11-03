import { compensationRule } from "./course-compensation";

/** Empty individual rules mean inheritance; zero is an explicit override. */
export function resolveSportsCoachCompensation(
  individual: { rules: unknown; revision: number } | null,
  shared: { rules: unknown; revision: number } | null,
) {
  const selected = individual && Array.isArray(individual.rules) && individual.rules.length === 0
    ? shared : individual ?? shared;
  if (!selected) return null;
  if (!Array.isArray(selected.rules) || selected.rules.length !== 1)
    throw new Error("教練計酬設定待核對");
  const rule = compensationRule.safeParse(selected.rules[0]);
  if (!rule.success) throw new Error("教練計酬設定待核對");
  return { rule: rule.data, revision: selected.revision, source: selected === individual ? "SPORTS_COACH_FEE" : "SPORTS_FEE" };
}
