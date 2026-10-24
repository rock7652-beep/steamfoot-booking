export type CourseSchedulingModes = { selfBookingEnabled?: boolean; assignedSchedulingEnabled?: boolean };
/** Legacy stores retain both their self-booking value and staff-assigned scheduling. */
export function courseSchedulingModes(rule?: CourseSchedulingModes | null) {
  return { open: rule?.selfBookingEnabled !== false, assigned: rule?.assignedSchedulingEnabled !== false };
}
export function courseSchedulingModeAllowed(rule: CourseSchedulingModes | null | undefined, mode: "OPEN" | "ASSIGNED") {
  const modes = courseSchedulingModes(rule);
  return mode === "OPEN" ? modes.open : modes.assigned;
}
