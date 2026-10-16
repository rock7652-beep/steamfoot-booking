/** HQ access is limited to the server-validated isolated music preview. */
export function canViewCourseMonthly(role: string, isolatedMusicPreview: boolean) {
  return role === "OWNER" || (role === "ADMIN" && isolatedMusicPreview);
}
/** Apply alongside the existing permission, store and subscription checks. */
export function canOperateCourseMonthly(role: string, isolatedMusicPreview: boolean) {
  return role === "OWNER" || (role === "ADMIN" && isolatedMusicPreview);
}
