"use client";

import { CustomerListIdentity } from "@/components/customer-list-identity";
import { RosterReminders } from "@/components/admin/roster-reminders";
import { spaReceiptStatus } from "@/lib/spa-booking-display";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";
import styles from "./booking-roster.module.css";

type Person = { id: string; name: string; phone?: string; serviceNote?: string | null };
const statusNames: Record<string, string> = { PENDING: "待確認", CONFIRMED: "已預約", CANCELLED: "已取消", COMPLETED: "已完成", NO_SHOW: "未到" };

/** Daily records retain SPA services and receipts; only reminders share course-list presentation. */
export function SpaBookingRoster({ bookings, customers, staff, locations, canUpdate, onOpen }: {
  bookings: SpaScheduleBooking[]; customers: Person[]; staff: Person[]; locations: Person[];
  canUpdate: boolean; onOpen: (booking: SpaScheduleBooking) => void;
}) {
  return <div className={styles.root}>
    <div className={styles.scroll} aria-label="SPA 當日預約名單捲動區" tabIndex={0}>
      <div className={`${styles.header} text-earth-600`} aria-hidden="true"><span>時間／服務</span><span>顧客／電話</span><span>狀態／收款</span><span>標籤／備註</span></div>
      <ul className="divide-y divide-earth-100">
        {bookings.map(booking => {
          const customer = customers.find(person => person.id === booking.customerId);
          const name = customer?.name ?? "顧客";
          return <li key={booking.id} className={styles.row}>
            <button type="button" onClick={() => onOpen(booking)} className="min-h-11 min-w-0 rounded text-left focus-visible:outline-2 focus-visible:outline-primary-600" aria-label={`${name} 預約詳情`}>
              <span className="block break-words">{booking.startTime}–{booking.endTime} · {booking.serviceName}</span>
              <span className="block break-words text-earth-500">{staff.find(person => person.id === booking.serviceStaffId)?.name ?? "服務人員"} · {locations.find(location => location.id === booking.serviceLocationId)?.name ?? "待安排位置"}</span>
            </button>
            <div className="min-w-0"><CustomerListIdentity customerId={booking.customerId} name={name} phone={customer?.phone} showLabels={false} readOnly={!canUpdate} /></div>
            <div className="min-w-0 break-words"><span>{statusNames[booking.status] ?? booking.status}</span>{booking.receipt && <span className="block text-earth-600">{spaReceiptStatus(booking.receipt)}</span>}</div>
            <RosterReminders className={styles.reminders} customerId={booking.customerId} name={name} serviceNote={customer?.serviceNote} notes={booking.notes} canEdit={canUpdate}
              canEditNote={canUpdate && ["PENDING", "CONFIRMED"].includes(booking.status)} onEdit={() => onOpen(booking)} />
          </li>;
        })}
        {!bookings.length && <li className="px-3 py-5 text-sm text-earth-500">尚無當日預約</li>}
      </ul>
    </div>
  </div>;
}
