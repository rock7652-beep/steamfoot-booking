"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";

const inputSchema = z.object({
  bookingId: z.literal(SPA_DEMO_LIVE_FLOW_BOOKING_ID),
  settlement: z.enum(["CASH", "CREDIT_CARD", "STORED_VALUE", "PACKAGE"]),
});

const SETTLEMENT_LABEL = {
  CASH: "現金",
  CREDIT_CARD: "刷卡",
  STORED_VALUE: "儲值金",
  PACKAGE: "扣療程 1 次",
} as const;

export async function completeSpaDemoBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 結帳不在正式站開放" };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "結帳資料不完整" };

  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, storeId: SPA_DEMO_STORE.id },
    select: {
      id: true,
      bookingStatus: true,
      treatmentPriceSnapshot: true,
      customer: { select: { storeId: true } },
      serviceStaff: { select: { storeId: true } },
    },
  });
  if (!booking || booking.customer.storeId !== SPA_DEMO_STORE.id || booking.serviceStaff?.storeId !== SPA_DEMO_STORE.id) {
    return { success: false as const, error: "Demo 預約不存在或資料隔離檢查失敗" };
  }
  if (booking.bookingStatus === "COMPLETED") {
    return { success: false as const, error: "此筆服務已完成，請勿重複結帳" };
  }
  if (!(["PENDING", "CONFIRMED"] as const).includes(booking.bookingStatus as "PENDING" | "CONFIRMED")) {
    return { success: false as const, error: "此預約狀態目前不能完成服務" };
  }

  const amount = Number(booking.treatmentPriceSnapshot ?? 0);
  const label = SETTLEMENT_LABEL[parsed.data.settlement];
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      bookingStatus: "COMPLETED",
      notes: `SPA_DEMO_LIVE_FLOW|settlement=${parsed.data.settlement}|label=${label}|amount=${amount}`,
    },
  });

  revalidatePath("/liff/design-preview");
  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/staff-preview");
  return {
    success: true as const,
    data: { bookingId: booking.id, settlementLabel: label, amount },
  };
}
