export type CourseSchedulingModes = { selfBookingEnabled?: boolean; assignedSchedulingEnabled?: boolean };
/** Legacy stores retain both their self-booking value and staff-assigned scheduling. */
export function courseSchedulingModes(rule?: CourseSchedulingModes | null) {
  return { open: rule?.selfBookingEnabled !== false, assigned: rule?.assignedSchedulingEnabled !== false };
}
export function courseSchedulingModeAllowed(rule: CourseSchedulingModes | null | undefined, mode: "OPEN" | "ASSIGNED") {
  const modes = courseSchedulingModes(rule);
  return mode === "OPEN" ? modes.open : modes.assigned;
}

/** Historical balances retain their original mode; new offers obey the store's current modes. */
export function coursePlanModeAllowed(rule: CourseSchedulingModes | null | undefined, mode?: string | null) {
  return mode === "OPEN" || mode === "ASSIGNED" ? courseSchedulingModeAllowed(rule, mode) : true;
}
