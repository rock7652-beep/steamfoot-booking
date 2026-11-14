import { z } from "zod";
import { courseHistoryRange,courseHistoryItem } from "./course-history-range";
export function courseBookingBrowse(range: {from?: string; to?: string; mode?: string;item?:string}, now = new Date()) {
  const mode = z.enum(["all", "upcoming", "history"]).parse(range.mode ?? "all");
  const dateRange = { session: { startsAt: courseHistoryRange(range) } };
  const upcoming = { status: "RESERVED" as const, session: { endsAt: { gt: now }, cancelledAt: null, releasedAt: null } };
  const base=mode === "all" ? dateRange : { AND: [dateRange, mode === "upcoming" ? upcoming : { NOT: upcoming }] };
  const item=courseHistoryItem(range);
  return {
    where:item?{AND:[base,{OR:[{card:{nameSnapshot:{contains:item,mode:"insensitive" as const}}},{session:{nameSnapshot:{contains:item,mode:"insensitive" as const}}}]}]}:base,
    order: mode === "upcoming" ? "asc" as const : "desc" as const,
  };
}
