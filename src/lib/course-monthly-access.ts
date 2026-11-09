/** Role eligibility only; callers must still authorize the selected store and operation. */
export function canViewCourseMonthly(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
export const canOperateCourseMonthly = canViewCourseMonthly;
