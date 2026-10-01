import { scheduleRosterBookings } from "@/lib/course-schedule-counts";
import { toLocalDateStr } from "@/lib/date-utils";

type ScheduleSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  roomId: string;
  coachId: string;
  isFixed?: boolean;
  previewFaded?: string;
  previewKind?: string;
  bookings: { status: string; customerId: string; absenceKind?: string | null }[];
  displayBookings?: { status: string; customerId: string; absenceKind?: string | null }[];
  rescheduledFromStartsAt?: string | null;
  rescheduledFromEndsAt?: string | null;
  rescheduledFromRoomId?: string | null;
  rescheduledFromCoachId?: string | null;
};

export function scheduleTotals(sessions: ScheduleSession[]) {
  const live = sessions.filter((session) => !session.previewFaded);
  const rentals = live.filter((session) => session.previewKind === "RENTAL");
  const classes = live.filter((session) => session.previewKind !== "RENTAL");
  return {
    classes: classes.length,
    people: classes.reduce((sum, session) => sum + (session.displayBookings ?? scheduleRosterBookings(session.bookings)).length, 0),
    rentals: rentals.length,
  };
}

export function scheduleOnDate<T extends ScheduleSession>(sessions: T[], date: string) {
  return sessions.filter((session) => toLocalDateStr(new Date(session.startsAt)) === date);
}

export function slotDecision(
  sessions: ScheduleSession[],
  target: { startsAt: string; endsAt: string; roomId: string; coachId: string; fixed: boolean; restoringId?: string },
) {
  const start = new Date(target.startsAt).getTime();
  const end = new Date(target.endsAt).getTime();
  for (const session of sessions) {
    if (session.id === target.restoringId) continue;
    if (session.previewFaded) {
      if (target.fixed && session.isFixed && start < new Date(session.endsAt).getTime() && end > new Date(session.startsAt).getTime() &&
        (session.roomId === target.roomId || session.coachId === target.coachId)) return "fixed-origin" as const;
      continue;
    }
    const occupied = start < new Date(session.endsAt).getTime() && end > new Date(session.startsAt).getTime();
    if (occupied && (session.roomId === target.roomId || session.coachId === target.coachId)) return "occupied" as const;
    if (!target.fixed || !session.isFixed || !session.rescheduledFromStartsAt || !session.rescheduledFromEndsAt) continue;
    const originalOverlap = start < new Date(session.rescheduledFromEndsAt).getTime() && end > new Date(session.rescheduledFromStartsAt).getTime();
    if (originalOverlap && (session.rescheduledFromRoomId === target.roomId || session.rescheduledFromCoachId === target.coachId)) return "fixed-origin" as const;
  }
  return "available" as const;
}
