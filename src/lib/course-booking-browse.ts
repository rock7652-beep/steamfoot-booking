import { z } from "zod";
import { courseHistoryRange } from "./course-history-range";
export function courseBookingBrowse(range: {from?: string; to?: string; mode?: string}, now = new Date()) {
  const mode = z.enum(["all", "upcoming", "history"]).parse(range.mode ?? "all");
  const dateRange = { session: { startsAt: courseHistoryRange(range) } };
  const upcoming = { status: "RESERVED" as const, session: { endsAt: { gt: now }, cancelledAt: null, releasedAt: null } };
  return {
    where: mode === "all" ? dateRange : { AND: [dateRange, mode === "upcoming" ? upcoming : { NOT: upcoming }] },
    order: mode === "upcoming" ? "asc" as const : "desc" as const,
  };
}
