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
  SPA_DEMO_LIVE_FLOW_TRANSACTION_ID,
  SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID,
  SPA_DEMO_LIVE_FLOW_STORED_LEDGER_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID,
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
  bookingSource: z.enum(["CUSTOMER", "MANAGER"]).default("CUSTOMER"),
  bookingOperation: z.enum(["CREATE", "UPDATE"]).default("CREATE"),
  primaryContact: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().regex(/^09\d{8}$/),
  }).optional(),
  guests: z.array(z.object({
    providerId: z.string().min(1),
    primaryKey: z.string().min(1),
    addOnKeys: z.array(z.string()).max(3),
  })).min(1).max(3),
}).superRefine((value, context) => {
  if (value.bookingSource === "MANAGER" && !value.primaryContact) {
    context.addIssue({ code: "custom", message: "請填寫主要聯絡人與電話" });
  }
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
  const customerName = data.bookingSource === "MANAGER"
    ? data.primaryContact!.name
    : SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME;
  const customerPhone = data.bookingSource === "MANAGER"
    ? data.primaryContact!.phone
    : "0911999999";
  const today = toLocalDateStr();
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 14);
  if (data.bookingDate < today || data.bookingDate > latest.toISOString().slice(0, 10)) {
    return { success: false as const, error: "Demo 僅開放今天起 14 天內預約" };
  }

  let guestServices;
  try {
    guestServices = data.guests.map((guest) => {
      const items = composeSpaServices(guest.primaryKey, guest.addOnKeys);
      const treatmentId = PRIMARY_TREATMENT_ID[guest.primaryKey];
      if (!treatmentId) throw new Error("SPA_DEMO_TREATMENT_MISSING");
      return { items, treatmentId, summary: summarizeSpaServices(items) };
    });
  } catch {
    return { success: false as const, error: "療程組合不正確" };
  }
  const people = data.guests.length;
  const treatmentIds = [...new Set(guestServices.map((service) => service.treatmentId))];

  const [store, treatmentOwners, packagePlan, idCollisions, providers] = await Promise.all([
    prisma.store.findFirst({
      where: { id: SPA_DEMO_STORE.id, slug: SPA_DEMO_STORE.slug, isDemo: true },
      select: { id: true },
    }),
    prisma.treatment.findMany({
      where: { id: { in: treatmentIds } },
      select: { id: true, storeId: true },
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

  if (!store || !packagePlan) {
    return { success: false as const, error: "Demo 店、人員或療程設定不完整" };
  }
  if (treatmentOwners.some((treatment) => treatment.storeId !== SPA_DEMO_STORE.id)) {
    return { success: false as const, error: "Demo 療程識別碼發生跨店衝突" };
  }
  const bookingCollisions = idCollisions[1];
  if ((idCollisions[0] && idCollisions[0].storeId !== SPA_DEMO_STORE.id)
    || bookingCollisions.some((record) => record.storeId !== SPA_DEMO_STORE.id)) {
    return { success: false as const, error: "Demo 測試識別碼發生跨店衝突" };
  }
  if (data.bookingOperation === "UPDATE") {
    const activeBookings = await prisma.booking.findMany({
      where: { id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] }, storeId: SPA_DEMO_STORE.id, bookingStatus: { not: "CANCELLED" } },
      select: { bookingStatus: true },
    });
    if (!activeBookings.length) return { success: false as const, error: "找不到可修改的預約" };
    if (activeBookings.some((booking) => !(["PENDING", "CONFIRMED"] as const).includes(booking.bookingStatus as "PENDING" | "CONFIRMED"))) {
      return { success: false as const, error: "服務開始或結帳後不能修改預約" };
    }
  }

  const providerIds = data.guests.map((guest) => guest.providerId);
  if (new Set(providerIds).size !== people) {
    return { success: false as const, error: "芳療師人數與預約人數不一致" };
  }
  const selectedProviders = providerIds.map((providerId) =>
    providers.find((candidate) => candidate.id === providerId),
  );
  if (selectedProviders.some((provider) => !provider)) {
    return { success: false as const, error: "芳療師目前未開放預約" };
  }
  for (const [index, provider] of selectedProviders.entries()) {
    const service = guestServices[index];
    if (!provider || !canProviderPerformServices(provider.specialties, service.items)) {
      return { success: false as const, error: "芳療師無法完成全部所選項目" };
    }
    if (!isSpaProviderAvailable({
      provider,
      date: data.bookingDate,
      startTime: data.slotTime,
      serviceMinutes: service.summary.durationMinutes,
      bufferMinutes: 30,
    })) {
      return { success: false as const, error: "此時段可服務人數已不足，請改選其他時間" };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, service] of guestServices.entries()) {
      await tx.treatment.upsert({
        where: { id: service.treatmentId },
        create: {
          id: service.treatmentId,
          storeId: SPA_DEMO_STORE.id,
          name: service.items.map((item) => item.name.replace("加購", "")).join("＋"),
          variantLabel: `${service.summary.durationMinutes} 分鐘`,
          price: service.summary.price,
          serviceMinutes: service.summary.durationMinutes,
          bufferMinutes: 30,
          publicVisible: false,
          sortOrder: 100 + index,
        },
        update: { isActive: true },
      });
    }
    await tx.storedValueLedgerEntry.deleteMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        OR: [
          { id: SPA_DEMO_LIVE_FLOW_STORED_LEDGER_ID },
          { bookingId: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } },
        ],
      },
    });
    await tx.transaction.deleteMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        OR: [
          { id: {
            in: [
              SPA_DEMO_LIVE_FLOW_TRANSACTION_ID,
              SPA_DEMO_LIVE_FLOW_STORED_TRANSACTION_ID,
              SPA_DEMO_LIVE_FLOW_PACKAGE_TRANSACTION_ID,
            ],
          } },
          { id: { startsWith: "spa-demo-transaction-live-split-" } },
        ],
      },
    });
    await tx.walletSession.updateMany({
      where: {
        walletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
        bookingId: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] },
      },
      data: { status: "AVAILABLE", bookingId: null, reservedAt: null, completedAt: null },
    });
    await tx.customer.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        storeId: SPA_DEMO_STORE.id,
        name: customerName,
        phone: customerPhone,
        assignedStaffId: providerIds[0],
        customerStage: "TRIAL",
        selfBookingEnabled: true,
        serviceNote: "SPA Demo 三端同步驗收顧客",
      },
      update: { name: customerName, phone: customerPhone, assignedStaffId: providerIds[0] },
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
      update: { status: "ACTIVE", balance: 5000 },
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
      update: { remainingSessions: 5, status: "ACTIVE" },
    });
    await tx.walletSession.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({ id: `${SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID}-session-${index + 1}`, walletId: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID, sessionNo: index + 1, status: "AVAILABLE" as const })),
      skipDuplicates: true,
    });
    for (const [index, providerId] of providerIds.entries()) {
      const bookingId = SPA_DEMO_LIVE_FLOW_BOOKING_IDS[index];
      const service = guestServices[index];
      const serviceName = service.items.map((item) => item.name.replace("加購", "")).join("＋");
      const requiredSpecialties = getRequiredSpecialties(service.items).join(",");
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
        bookedByType: data.bookingSource === "MANAGER" ? "STAFF" : "CUSTOMER",
        bookingType: "SINGLE",
        treatmentId: service.treatmentId,
        bookingStatus: "CONFIRMED",
        notes: `SPA_DEMO_LIVE_FLOW|party=${people}|guest=${index + 1}|skills=${requiredSpecialties}`,
        treatmentNameSnapshot: serviceName,
        treatmentVariantSnapshot: `${people} 位同行・第 ${index + 1} 位`,
        treatmentPriceSnapshot: service.summary.price,
        treatmentServiceMinutesSnapshot: service.summary.durationMinutes,
        treatmentBufferMinutesSnapshot: 30,
      },
      update: {
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
        slotTime: data.slotTime,
        revenueStaffId: providerId,
        serviceStaffId: providerId,
        bookedByType: data.bookingSource === "MANAGER" ? "STAFF" : "CUSTOMER",
        treatmentId: service.treatmentId,
        bookingType: "SINGLE",
        servicePlanId: null,
        customerPlanWalletId: null,
        bookingStatus: "CONFIRMED",
        notes: `SPA_DEMO_LIVE_FLOW|party=${people}|guest=${index + 1}|skills=${requiredSpecialties}`,
        treatmentNameSnapshot: serviceName,
        treatmentVariantSnapshot: `${people} 位同行・第 ${index + 1} 位`,
        treatmentPriceSnapshot: service.summary.price,
        treatmentServiceMinutesSnapshot: service.summary.durationMinutes,
        treatmentBufferMinutesSnapshot: 30,
      },
      });
    }
    const unusedBookingIds = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(people);
    if (unusedBookingIds.length) {
      await tx.booking.updateMany({
        where: { id: { in: [...unusedBookingIds] }, storeId: SPA_DEMO_STORE.id },
        data: { bookingStatus: "CANCELLED" },
      });
    }
  });

  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/design-preview/booking");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/staff-schedule");
  return {
    success: true as const,
    data: {
      bookingId: SPA_DEMO_LIVE_FLOW_BOOKING_ID,
      bookingIds: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS.slice(0, people)],
      customerName,
      people,
      providerIds,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
    },
  };
}
