/** HQ read-only access is permitted only after the server validates the isolated music preview. */
export function canViewCourseMonthly(role: string, isolatedMusicPreview: boolean) {
  return role === "OWNER" || (role === "ADMIN" && isolatedMusicPreview);
}
