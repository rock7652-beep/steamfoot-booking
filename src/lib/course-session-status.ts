export type CourseSessionStatus = {
  kind: "upcoming" | "ongoing" | "pending" | "completed" | "no-show" | "ended";
  label: string;
  badgeClass: string;
  accentClass: string;
  calendarClass: string;
};

const styles = {
  upcoming: {
    badgeClass: "bg-sky-50 text-sky-800",
    accentClass: "border-l-sky-400",
    calendarClass: "bg-sky-50 text-sky-900",
  },
  ongoing: {
    badgeClass: "bg-amber-50 text-amber-800",
    accentClass: "border-l-amber-400",
    calendarClass: "bg-amber-50 text-amber-900",
  },
  pending: {
    badgeClass: "bg-orange-50 text-orange-800",
    accentClass: "border-l-orange-400",
    calendarClass: "bg-orange-50 text-orange-900",
  },
  completed: {
    badgeClass: "bg-emerald-50 text-emerald-800",
    accentClass: "border-l-emerald-500",
    calendarClass: "bg-emerald-50 text-emerald-900",
  },
  "no-show": {
    badgeClass: "bg-red-50 text-red-700",
    accentClass: "border-l-red-400",
    calendarClass: "bg-red-50 text-red-800",
  },
  ended: {
    badgeClass: "bg-earth-100 text-earth-700",
    accentClass: "border-l-earth-300",
    calendarClass: "bg-earth-100 text-earth-700",
  },
} as const;

export function courseSessionStatus(
  session: { startsAt: string; endsAt: string; bookings: { status: string }[] },
  nowIso: string,
): CourseSessionStatus {
  const now = new Date(nowIso).getTime();
  const startsAt = new Date(session.startsAt).getTime();
  const endsAt = new Date(session.endsAt).getTime();

  if (now < startsAt) return { kind: "upcoming", label: "未開始", ...styles.upcoming };
  if (now < endsAt) return { kind: "ongoing", label: "進行中", ...styles.ongoing };

  const reserved = session.bookings.filter((booking) => booking.status === "RESERVED").length;
  const noShow = session.bookings.filter((booking) => booking.status === "NO_SHOW").length;
  const attended = session.bookings.filter((booking) => booking.status === "ATTENDED").length;
  if (reserved > 0) return { kind: "pending", label: `待點名 ${reserved}`, ...styles.pending };
  if (noShow > 0) return { kind: "no-show", label: `未到 ${noShow}`, ...styles["no-show"] };
  if (attended > 0) return { kind: "completed", label: "已完成", ...styles.completed };
  return { kind: "ended", label: "已結束", ...styles.ended };
}
