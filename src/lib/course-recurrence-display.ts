import { parseLocalDate, toLocalDateStr } from "@/lib/date-utils";

type RecurringSession = { id: string; requestKey?: string; startsAt: string; rescheduledFromStartsAt?: string | null };

// Only label a series when the visible occurrences prove its interval.
export function courseRecurrenceLabels<T extends RecurringSession>(sessions: T[]) {
  const groups = new Map<string, T[]>();
  for (const session of sessions) {
    if (!session.requestKey) continue;
    const group = groups.get(session.requestKey) ?? [];
    group.push(session);
    groups.set(session.requestKey, group);
  }

  const labels = new Map<string, "每週固定" | "隔週固定">();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const dates = [...new Set(group.map((session) => toLocalDateStr(new Date(session.rescheduledFromStartsAt ?? session.startsAt))))]
      .sort();
    if (dates.length < 2) continue;
    const intervals = dates.slice(1).map((date, index) =>
      Math.round((parseLocalDate(date).getTime() - parseLocalDate(dates[index]).getTime()) / 86400000),
    );
    const label = intervals.every((days) => days === 7)
      ? "每週固定"
      : intervals.every((days) => days === 14)
        ? "隔週固定"
        : null;
    if (label) group.forEach((session) => labels.set(session.id, label));
  }
  return labels;
}
