/** Persisted module rules take precedence over legacy CourseSession defaults. */
export function courseEnrollmentMode(session: {enrollmentMode?: string | null; bookingAudience?: string | null}, moduleMode?: string | null) {
  if (moduleMode != null) return moduleMode;
  if (session.enrollmentMode === "ASSIGNED" || session.bookingAudience === "ASSIGNED") return "ASSIGNED";
  return session.enrollmentMode ?? "OPEN";
}

/** Assigned rosters have no seat limit; missing/unknown modes remain limited. */
export function courseHasSeatLimit(session: {enrollmentMode?: string | null; bookingAudience?: string | null}, moduleMode?: string | null) {
  return courseEnrollmentMode(session, moduleMode) !== "ASSIGNED";
}
