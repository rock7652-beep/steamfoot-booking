/** HQ access requires the server-validated native music capability; per-operation permissions remain mandatory. */
export function canViewCourseMonthly(role: string, nativeMusicEnabled: boolean) {
  return role === "OWNER" || (role === "ADMIN" && nativeMusicEnabled);
}
/** Apply alongside the existing permission, store and subscription checks. */
export function canOperateCourseMonthly(role: string, nativeMusicEnabled: boolean) {
  return role === "OWNER" || (role === "ADMIN" && nativeMusicEnabled);
}
