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
  partyGroupId?:string|null;guestIndex?:number;
  receipt?: {id:string;amount:number;paymentMethod:string;paidAt:string;balanceAfter?:number|null;uses?:number|null;refunded?:boolean}|null;
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
      partyGroupId:true,guestIndex:true,
    receipt: {select:{id:true,amount:true,paymentMethod:true,paidAt:true,balanceAfter:true,uses:true}},
      items: { orderBy: { sortOrder: "asc" }, select: { treatmentId: true } },
    },
  });
  const refunds=await spaPrisma.spaRefund.findMany({where:{storeId,receiptId:{in:rows.flatMap(r=>r.receipt?[r.receipt.id]:[])}},select:{receiptId:true}});
  const refunded=new Set(refunds.map(r=>r.receiptId));
  return rows.map((row) => ({
    partyGroupId:row.partyGroupId,guestIndex:row.guestIndex,
    receipt:row.receipt?{id:row.receipt.id,amount:Number(row.receipt.amount),paymentMethod:row.receipt.paymentMethod,paidAt:row.receipt.paidAt.toISOString(),balanceAfter:row.receipt.balanceAfter===null?null:Number(row.receipt.balanceAfter),uses:row.receipt.uses,refunded:refunded.has(row.receipt.id)}:null,
    id: row.id, customerId: row.customerId, serviceStaffId: row.serviceStaffId,
    startTime: row.startTime, endTime: row.endTime, status: row.status,
    serviceName: row.serviceNameSnapshot, totalPrice: Number(row.totalPriceSnapshot),
    serviceLocationId: row.serviceLocationId, notes: row.notes ?? "",
    treatmentIds: row.items.map(i => i.treatmentId), updatedAt: row.updatedAt.toISOString(),
  }));
}
