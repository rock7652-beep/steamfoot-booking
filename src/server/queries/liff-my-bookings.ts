import "server-only";
import { prisma } from "@/lib/db";
import { splitLiffBookings } from "@/lib/liff/my-bookings";

/** LIFF「我的預約」單筆 row 顯示用 payload — 刻意精簡。 */
export interface LiffBookingRow {
  id: string;
  /** "YYYY-MM-DD"（Date → string 在 server 邊界序列化）*/
  bookingDate: string;
  /** "HH:mm" */
  slotTime: string;
  /** BookingStatus 原值；client 端 STATUS_LABEL 翻譯 */
  bookingStatus: string;
  /** BookingType 原值；client 端 mapping 翻譯（isMakeup 優先）*/
  bookingType: string;
  isMakeup: boolean;
  /** 預約人數；首頁方案摘要以所有未來預約人數加總。 */
  people: number;
  /** SPA-only display fields. Legacy rows intentionally omit them. */
  endTime?: string;
  serviceName?: string;
  staffName?: string;
  locationName?: string;
}

export type FetchLiffBookingsResult =
  | { status: "ok"; upcoming: LiffBookingRow[]; history: LiffBookingRow[] }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

// 註：`splitLiffBookings` pure helper 在 `src/lib/liff/my-bookings.ts`。
// "use server" 檔不能 export 非 async function（Next build 會 fail），故拆出去。

export async function readFetchLiffBookings({ storeId, customerId }: { storeId: string; customerId: string }): Promise<FetchLiffBookingsResult> {
  // ── 3. Query — tight LIFF payload ──────────────────
  //
  // 排序 bookingDate DESC + slotTime ASC：
  //   take:50 拿到最近 50 筆（往未來/往過去都涵蓋），讓 splitLiffBookings 分群。
  //   upcoming 之後 reverse → 顯示「最近一筆在最上面」。
  let rawBookings: Array<{
    id: string;
    bookingDate: Date;
    slotTime: string;
    bookingStatus: string;
    bookingType: string;
    isMakeup: boolean;
    people: number;
  }>;
  try {
    rawBookings = await prisma.booking.findMany({
      where: { customerId, storeId },
      select: {
        id: true,
        bookingDate: true,
        slotTime: true,
        bookingStatus: true,
        bookingType: true,
        isMakeup: true,
        people: true,
      },
      orderBy: [{ bookingDate: "desc" }, { slotTime: "asc" }],
      take: 50,
    });
  } catch (err) {
    console.error("[fetchLiffBookings] query failed", err);
    return { status: "service_unavailable" };
  }

  // ── 4. Split before serialization (need Date) ──────
  const { upcoming, history } = splitLiffBookings(rawBookings);
  // upcoming DESC → ASC（最近一筆在最上面；DB 是 DESC 故 reverse）
  upcoming.reverse();

  const toRow = (b: (typeof rawBookings)[number]): LiffBookingRow => ({
    id: b.id,
    bookingDate: b.bookingDate.toISOString().slice(0, 10),
    slotTime: b.slotTime,
    bookingStatus: b.bookingStatus,
    bookingType: b.bookingType,
    isMakeup: b.isMakeup,
    people: b.people,
  });

  return {
    status: "ok",
    upcoming: upcoming.map(toRow),
    history: history.map(toRow),
  };
}
