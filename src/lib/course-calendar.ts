import { parseLocalDate, toLocalDateStr } from "@/lib/date-utils";

export function courseMonthDays(month: string) {
  const [year, number] = month.split("-").map(Number);
  const count = new Date(year, number, 0).getDate();
  return {
    offset: parseLocalDate(`${month}-01`).getDay(),
    dates: Array.from(
      { length: count },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  };
}

export function courseDate(startsAt: string) {
  return toLocalDateStr(new Date(startsAt));
}

/** Mark the learner, never the person who submitted the booking. */
export function courseMemberMarkers(
  bookings: { customerId: string; status: string }[],
  customerId: string,
) {
  const active = bookings.filter(
    (b) => b.status === "RESERVED" || b.status === "ATTENDED",
  );
  return {
    self: active.some((b) => b.customerId === customerId),
    shared: active.some((b) => b.customerId !== customerId),
  };
}

export function coursePeople(
  bookings: { customerId: string; status: string }[],
) {
  const active = bookings.filter((b) => b.status !== "CANCELLED");
  return {
    people: new Set(active.map((b) => b.customerId)).size,
    visits: active.length,
  };
}
