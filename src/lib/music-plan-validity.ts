/** Existing purchases/plans and explicitly edited days must never be reset by a mode change. */
export function musicSchedulePatch(mode: string, days: string, preserve: boolean) {
  return { musicScheduleMode: mode, musicValidityDaysPerTerm: preserve ? days : mode === "APPOINTMENT" ? "70" : "35" };
}
