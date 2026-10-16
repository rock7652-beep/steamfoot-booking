// Compatibility exports for existing consumers; music rules live in their own module.
export type { TeacherFeeSeat, TeacherFeeDetail, TeacherFeeResult } from "./teacher-fee-types";
export { originalMusicUnitPrice, calculateMusicTeacherFee as calculateTeacherFee } from "./music-teacher-fee";

/** The version lives in the immutable class rule. Existing class rounding is not rewritten. */
export function isTeacherFeeV2(rule: unknown): boolean {
  return !!rule && typeof rule === "object" && "calculationVersion" in rule && rule.calculationVersion === 2;
}
