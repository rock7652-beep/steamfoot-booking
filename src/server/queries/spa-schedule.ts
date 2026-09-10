import "server-only";

import { spaPrisma } from "@/lib/spa-db";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";

export type SpaScheduleBooking = {
  id: string;
  customerId: string;
  serviceStaffId: string;
  startTime: string;
  endTime: string;
  status: string;
  serviceName: string;
  totalPrice: number;
  serviceLocationId: string | null;
  notes: string;
  treatmentIds: string[];
  updatedAt: string;
};

/** SPA schedule read boundary. Never import the legacy Booking query in this module. */
export async function getSpaScheduleForDay(storeId: string, date: string): Promise<SpaScheduleBooking[]> {
  const rows = await spaPrisma.spaBooking.findMany({
    where: { storeId, bookingDate: parseTaiwanDateToDbDate(date) },
    orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, customerId: true, serviceStaffId: true, startTime: true, endTime: true,
      status: true, serviceNameSnapshot: true, totalPriceSnapshot: true,
      serviceLocationId: true, notes: true, updatedAt: true,
      items: { orderBy: { sortOrder: "asc" }, select: { treatmentId: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id, customerId: row.customerId, serviceStaffId: row.serviceStaffId,
    startTime: row.startTime, endTime: row.endTime, status: row.status,
    serviceName: row.serviceNameSnapshot, totalPrice: Number(row.totalPriceSnapshot),
    serviceLocationId: row.serviceLocationId, notes: row.notes ?? "",
    treatmentIds: row.items.map(i => i.treatmentId), updatedAt: row.updatedAt.toISOString(),
  }));
}
