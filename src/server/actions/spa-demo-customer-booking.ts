"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_PROVIDERS,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";
import {
  canProviderPerformServices,
  composeSpaServices,
  getRequiredSpecialties,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";

const inputSchema = z.object({
  customerName: z.string().trim().min(1, "請輸入測試顧客姓名").max(30),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  providerId: z.string().min(1),
  primaryKey: z.string().min(1),
  addOnKeys: z.array(z.string()).max(3),
});

const PROVIDER_SPECIALTIES = new Map(
  SPA_DEMO_PROVIDERS.map((provider) => [provider.id, provider.specialtyKeys]),
);

const PRIMARY_TREATMENT_ID: Record<string, string> = {
  aroma_body_60: "spa-demo-treatment-body-60",
  deep_body_90: "spa-demo-treatment-body-90",
  facial_60: "spa-demo-treatment-face-60",
  sleep_combo_120: "spa-demo-treatment-combo-b",
};

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export async function createSpaDemoCustomerBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 預約不在正式站開放" };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  }

  const data = parsed.data;
  const today = toLocalDateStr();
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 14);
  if (data.bookingDate < today || data.bookingDate > latest.toISOString().slice(0, 10)) {
    return { success: false as const, error: "Demo 僅開放今天起 14 天內預約" };
  }

  const providerSpecialties = PROVIDER_SPECIALTIES.get(data.providerId);
  if (!providerSpecialties) return { success: false as const, error: "芳療師不在 Demo 名單內" };

  let items;
  try {
    items = composeSpaServices(data.primaryKey, data.addOnKeys);
  } catch {
    return { success: false as const, error: "療程組合不正確" };
  }
  if (!canProviderPerformServices(providerSpecialties, items)) {
    return { success: false as const, error: "這位芳療師無法完成全部所選項目" };
  }

  const summary = summarizeSpaServices(items);
  const treatmentId = PRIMARY_TREATMENT_ID[data.primaryKey];
  if (!treatmentId) return { success: false as const, error: "Demo 主療程尚未設定" };

  const [store, provider, treatment, idCollisions, occupied] = await Promise.all([
    prisma.store.findFirst({
      where: { id: SPA_DEMO_STORE.id, slug: SPA_DEMO_STORE.slug, isDemo: true },
      select: { id: true },
    }),
    prisma.staff.findFirst({
      where: { id: data.providerId, storeId: SPA_DEMO_STORE.id, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.treatment.findFirst({
      where: { id: treatmentId, storeId: SPA_DEMO_STORE.id, isActive: true },
      select: { id: true },
    }),
    Promise.all([
      prisma.customer.findUnique({ where: { id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID }, select: { storeId: true } }),
      prisma.booking.findUnique({ where: { id: SPA_DEMO_LIVE_FLOW_BOOKING_ID }, select: { storeId: true } }),
    ]),
    prisma.booking.findMany({
      where: {
        id: { not: SPA_DEMO_LIVE_FLOW_BOOKING_ID },
        storeId: SPA_DEMO_STORE.id,
        serviceStaffId: data.providerId,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { slotTime: true, treatmentServiceMinutesSnapshot: true, treatmentBufferMinutesSnapshot: true },
    }),
  ]);

  if (!store || !provider || !treatment) {
    return { success: false as const, error: "Demo 店、人員或療程設定不完整" };
  }
  if (idCollisions.some((record) => record && record.storeId !== SPA_DEMO_STORE.id)) {
    return { success: false as const, error: "Demo 測試識別碼發生跨店衝突" };
  }

  const requestedStart = minutes(data.slotTime);
  const requestedEnd = requestedStart + summary.durationMinutes + 30;
  const conflict = occupied.some((booking) => {
    const start = minutes(booking.slotTime);
    const end = start + (booking.treatmentServiceMinutesSnapshot ?? 90) + (booking.treatmentBufferMinutesSnapshot ?? 0);
    return requestedStart < end && start < requestedEnd;
  });
  if (conflict) return { success: false as const, error: "此時段與芳療師既有預約重疊，請改選其他時間" };

  const serviceName = items.map((item) => item.name.replace("加購", "")).join("＋");
  const requiredSpecialties = getRequiredSpecialties(items).join(",");

  await prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        storeId: SPA_DEMO_STORE.id,
        name: data.customerName,
        phone: "0911999999",
        assignedStaffId: data.providerId,
        customerStage: "TRIAL",
        selfBookingEnabled: true,
        serviceNote: "SPA Demo 三端同步驗收顧客",
      },
      update: { name: data.customerName, assignedStaffId: data.providerId },
    });
    await tx.booking.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_BOOKING_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_BOOKING_ID,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        slotTime: data.slotTime,
        revenueStaffId: data.providerId,
        serviceStaffId: data.providerId,
        bookedByType: "CUSTOMER",
        bookingType: "SINGLE",
        treatmentId,
        bookingStatus: "CONFIRMED",
        notes: `SPA_DEMO_LIVE_FLOW|skills=${requiredSpecialties}`,
        treatmentNameSnapshot: serviceName,
        treatmentVariantSnapshot: `共 ${items.length} 項服務`,
        treatmentPriceSnapshot: summary.price,
        treatmentServiceMinutesSnapshot: summary.durationMinutes,
        treatmentBufferMinutesSnapshot: 30,
      },
      update: {
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        slotTime: data.slotTime,
        revenueStaffId: data.providerId,
        serviceStaffId: data.providerId,
        treatmentId,
        bookingStatus: "CONFIRMED",
        notes: `SPA_DEMO_LIVE_FLOW|skills=${requiredSpecialties}`,
        treatmentNameSnapshot: serviceName,
        treatmentVariantSnapshot: `共 ${items.length} 項服務`,
        treatmentPriceSnapshot: summary.price,
        treatmentServiceMinutesSnapshot: summary.durationMinutes,
        treatmentBufferMinutesSnapshot: 30,
      },
    });
  });

  revalidatePath("/liff/manager-preview");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/staff-schedule");
  return {
    success: true as const,
    data: {
      bookingId: SPA_DEMO_LIVE_FLOW_BOOKING_ID,
      customerName: data.customerName,
      providerId: data.providerId,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
    },
  };
}
