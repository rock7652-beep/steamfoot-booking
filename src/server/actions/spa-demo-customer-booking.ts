"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME,
  SPA_DEMO_STORE,
  SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID,
} from "@/lib/spa-demo-store";
import {
  canProviderPerformServices,
  composeSpaServices,
  getRequiredSpecialties,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";
import { isSpaProviderAvailable } from "@/lib/spa-provider-availability";
import { getSpaDemoBookableProviders } from "@/server/queries/spa-demo-booking-availability";

const inputSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  people: z.number().int().min(1).max(3),
  providerIds: z.array(z.string().min(1)).min(1).max(3),
  primaryKey: z.string().min(1),
  addOnKeys: z.array(z.string()).max(3),
});

const PRIMARY_TREATMENT_ID: Record<string, string> = {
  aroma_body_60: "spa-demo-treatment-body-60",
  deep_body_90: "spa-demo-treatment-body-90",
  facial_60: "spa-demo-treatment-face-60",
  sleep_combo_120: "spa-demo-treatment-combo-b",
};

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

  let items;
  try {
    items = composeSpaServices(data.primaryKey, data.addOnKeys);
  } catch {
    return { success: false as const, error: "療程組合不正確" };
  }
  const summary = summarizeSpaServices(items);
  const treatmentId = PRIMARY_TREATMENT_ID[data.primaryKey];
  if (!treatmentId) return { success: false as const, error: "Demo 主療程尚未設定" };

  const [store, treatment, packagePlan, idCollisions, providers] = await Promise.all([
    prisma.store.findFirst({
      where: { id: SPA_DEMO_STORE.id, slug: SPA_DEMO_STORE.slug, isDemo: true },
      select: { id: true },
    }),
    prisma.treatment.findFirst({
      where: { id: treatmentId, storeId: SPA_DEMO_STORE.id, isActive: true },
      select: { id: true },
    }),
    prisma.servicePlan.findFirst({
      where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_PLAN_ID, storeId: SPA_DEMO_STORE.id, isActive: true },
      select: { id: true, price: true },
    }),
    Promise.all([
      prisma.customer.findUnique({ where: { id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID }, select: { storeId: true, name: true } }),
      prisma.booking.findMany({ where: { id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } }, select: { storeId: true } }),
    ]),
    getSpaDemoBookableProviders({
      startDate: data.bookingDate,
      endDate: data.bookingDate,
      excludeBookingIds: SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
    }),
  ]);

  if (!store || !treatment || !packagePlan) {
    return { success: false as const, error: "Demo 店、人員或療程設定不完整" };
  }
  const bookingCollisions = idCollisions[1];
  if ((idCollisions[0] && idCollisions[0].storeId !== SPA_DEMO_STORE.id)
    || bookingCollisions.some((record) => record.storeId !== SPA_DEMO_STORE.id)) {
    return { success: false as const, error: "Demo 測試識別碼發生跨店衝突" };
  }

  if (data.providerIds.length !== data.people || new Set(data.providerIds).size !== data.people) {
    return { success: false as const, error: "芳療師人數與預約人數不一致" };
  }
  const selectedProviders = data.providerIds.map((providerId) =>
    providers.find((candidate) => candidate.id === providerId),
  );
  if (selectedProviders.some((provider) => !provider)) {
    return { success: false as const, error: "芳療師目前未開放預約" };
  }
  for (const provider of selectedProviders) {
    if (!provider || !canProviderPerformServices(provider.specialties, items)) {
      return { success: false as const, error: "芳療師無法完成全部所選項目" };
    }
    if (!isSpaProviderAvailable({
      provider,
      date: data.bookingDate,
      startTime: data.slotTime,
      serviceMinutes: summary.durationMinutes,
      bufferMinutes: 30,
    })) {
      return { success: false as const, error: "此時段可服務人數已不足，請改選其他時間" };
    }
  }

  const serviceName = items.map((item) => item.name.replace("加購", "")).join("＋");
  const requiredSpecialties = getRequiredSpecialties(items).join(",");

  await prisma.$transaction(async (tx) => {
    await tx.customer.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        storeId: SPA_DEMO_STORE.id,
        name: SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME,
        phone: "0911999999",
        assignedStaffId: data.providerIds[0],
        customerStage: "TRIAL",
        selfBookingEnabled: true,
        serviceNote: "SPA Demo 三端同步驗收顧客",
      },
      update: { assignedStaffId: data.providerIds[0] },
    });
    await tx.storedValueWallet.upsert({
      where: { storeId_customerId: { storeId: SPA_DEMO_STORE.id, customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID } },
      create: {
        id: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        balance: 5000,
        entries: { create: { storeId: SPA_DEMO_STORE.id, customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID, entryType: "ADJUSTMENT", amount: 5000, balanceAfter: 5000, note: "SPA Demo 驗收期初餘額" } },
      },
      update: { status: "ACTIVE" },
    });
    await tx.customerPlanWallet.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        planId: packagePlan.id,
        purchasedPrice: packagePlan.price,
        totalSessions: 5,
        remainingSessions: 5,
        startDate: parseTaiwanDateToDbDate(data.bookingDate),
        expiryDate: latest,
        status: "ACTIVE",
      },
      update: {},
    });
    await tx.walletSession.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({ id: `${SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID}-session-${index + 1}`, walletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID, sessionNo: index + 1, status: "AVAILABLE" as const })),
      skipDuplicates: true,
    });
    for (const [index, providerId] of data.providerIds.entries()) {
      const bookingId = SPA_DEMO_LIVE_FLOW_BOOKING_IDS[index];
      await tx.booking.upsert({
        where: { id: bookingId },
        create: {
        id: bookingId,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        slotTime: data.slotTime,
        revenueStaffId: providerId,
        serviceStaffId: providerId,
        bookedByType: "CUSTOMER",
        bookingType: "SINGLE",
        treatmentId,
        bookingStatus: "CONFIRMED",
        notes: `SPA_DEMO_LIVE_FLOW|party=${data.people}|guest=${index + 1}|skills=${requiredSpecialties}`,
        treatmentNameSnapshot: serviceName,
        treatmentVariantSnapshot: `${data.people} 位・共 ${items.length} 項服務`,
        treatmentPriceSnapshot: summary.price,
        treatmentServiceMinutesSnapshot: summary.durationMinutes,
        treatmentBufferMinutesSnapshot: 30,
      },
      update: {
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        slotTime: data.slotTime,
        revenueStaffId: providerId,
        serviceStaffId: providerId,
        treatmentId,
        bookingType: "SINGLE",
        servicePlanId: null,
        customerPlanWalletId: null,
        bookingStatus: "CONFIRMED",
        notes: `SPA_DEMO_LIVE_FLOW|party=${data.people}|guest=${index + 1}|skills=${requiredSpecialties}`,
        treatmentNameSnapshot: serviceName,
        treatmentVariantSnapshot: `${data.people} 位・共 ${items.length} 項服務`,
        treatmentPriceSnapshot: summary.price,
        treatmentServiceMinutesSnapshot: summary.durationMinutes,
        treatmentBufferMinutesSnapshot: 30,
      },
      });
    }
    const unusedBookingIds = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(data.people);
    if (unusedBookingIds.length) {
      await tx.booking.updateMany({
        where: { id: { in: [...unusedBookingIds] }, storeId: SPA_DEMO_STORE.id },
        data: { bookingStatus: "CANCELLED" },
      });
    }
  });

  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/design-preview/booking");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/staff-schedule");
  return {
    success: true as const,
    data: {
      bookingId: SPA_DEMO_LIVE_FLOW_BOOKING_ID,
      customerName: idCollisions[0]?.name ?? SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME,
      people: data.people,
      providerIds: data.providerIds,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
    },
  };
}
