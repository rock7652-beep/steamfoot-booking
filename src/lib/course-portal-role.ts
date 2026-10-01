export type CoursePortalRole = "member" | "coach";

// A preference only: current server permissions always determine available roles.
export function coursePortalRoleCookie(userId: string, storeId: string) {
  return `course-role-v1-${encodeURIComponent(JSON.stringify([userId, storeId]))}`;
}

export function resolveCoursePortalRole(preferred: unknown, memberEnabled: boolean, hasWork: boolean): CoursePortalRole {
  if (!hasWork) return "member";
  if (!memberEnabled) return "coach";
  return preferred === "coach" ? "coach" : "member";
}

export function rememberCoursePortalRole(cookieName: string, role: CoursePortalRole) {
  document.cookie = `${cookieName}=${role}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
