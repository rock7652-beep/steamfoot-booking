"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import {
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
  SPA_DEMO_STORE,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import {
  addMinutes,
  canProviderPerformServices,
  composeSpaServices,
  getRequiredSpecialties,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";
import { isSpaProviderAvailable } from "@/lib/spa-provider-availability";
import { requireSpaStore } from "@/lib/industry-module-server";
import { getSpaDemoBookableProviders } from "@/server/queries/spa-demo-booking-availability";
import {
  deliverSpaDemoBookingNotificationBestEffort,
  saveSpaDemoBookingNotification,
} from "@/server/services/spa-demo-booking-notification";

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

function treatmentIdFor(key: string) {
  return `spa-demo-treatment-${key.replaceAll("_", "-")}`;
}

export async function createSpaDemoCustomerBooking(input: unknown) {
  if (process.env.VERCEL_ENV === "production") {
    return { success: false as const, error: "Demo 預約不在正式站開放" };
  }
  await requireSpaStore(SPA_DEMO_STORE.id);

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "預約資料不完整" };
  }

  const data = parsed.data;
  const customerName = data.bookingSource === "MANAGER" ? data.primaryContact!.name : SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME;
  const customerPhone = data.bookingSource === "MANAGER" ? data.primaryContact!.phone : "0911999999";
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
      return { items, summary: summarizeSpaServices(items) };
    });
  } catch {
    return { success: false as const, error: "療程組合不正確" };
  }

  const people = data.guests.length;
  const providerIds = data.guests.map((guest) => guest.providerId);
  if (new Set(providerIds).size !== people) {
    return { success: false as const, error: "芳療師人數與預約人數不一致" };
  }

  const providers = await getSpaDemoBookableProviders({
    startDate: data.bookingDate,
    endDate: data.bookingDate,
    excludeBookingIds: SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  });
  const selectedProviders = providerIds.map((providerId) => providers.find((provider) => provider.id === providerId));
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

  const customerCollision = await prisma.customer.findUnique({
    where: { id: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID },
    select: { storeId: true },
  });
  if (customerCollision && customerCollision.storeId !== SPA_DEMO_STORE.id) {
    return { success: false as const, error: "Demo 測試識別碼發生跨店衝突" };
  }

  await prisma.customer.upsert({
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

  await spaPrisma.$transaction(async (tx) => {
    const existing = await tx.spaBooking.findMany({
      where: { id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } },
      select: { id: true, storeId: true },
    });
    if (existing.some((booking) => booking.storeId !== SPA_DEMO_STORE.id)) {
      throw new Error("SPA_DEMO_BOOKING_ID_COLLISION");
    }

    const existingPayments = await tx.spaPayment.findMany({
      where: { storeId: SPA_DEMO_STORE.id, bookingId: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } },
      select: { id: true },
    });
    const paymentIds = existingPayments.map((payment) => payment.id);
    await tx.spaStoredValueEntry.deleteMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        OR: [
          { bookingId: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } },
          ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
        ],
      },
    });
    await tx.spaEntitlementUse.deleteMany({
      where: { storeId: SPA_DEMO_STORE.id, bookingId: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } },
    });
    if (paymentIds.length) {
      await tx.spaPayment.deleteMany({ where: { storeId: SPA_DEMO_STORE.id, refundOfPaymentId: { in: paymentIds } } });
      await tx.spaPayment.deleteMany({ where: { storeId: SPA_DEMO_STORE.id, id: { in: paymentIds } } });
    }
    await tx.spaBooking.deleteMany({
      where: { storeId: SPA_DEMO_STORE.id, id: { in: [...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] } },
    });

    await tx.spaStoredValueEntry.deleteMany({
      where: { storeId: SPA_DEMO_STORE.id, walletId: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID },
    });
    await tx.spaStoredValueWallet.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        balance: 5000,
      },
      update: { status: "ACTIVE", balance: 5000 },
    });
    await tx.spaStoredValueEntry.create({
      data: {
        id: `${SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID}-opening`,
        walletId: SPA_DEMO_LIVE_FLOW_STORED_WALLET_ID,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        entryType: "ADJUSTMENT",
        amount: 5000,
        balanceAfter: 5000,
        note: "SPA Demo 驗收期初餘額",
      },
    });

    await tx.spaEntitlement.upsert({
      where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID },
      create: {
        id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
        nameSnapshot: "SPA Demo 五次療程",
        purchasedPrice: 6500,
        totalUses: 5,
        remainingUses: 5,
        startDate: parseTaiwanDateToDbDate(data.bookingDate),
        expiryDate: latest,
        sourceReference: "spa-demo",
      },
      update: { remainingUses: 5, status: "ACTIVE", expiryDate: latest },
    });

    for (const [guestIndex, service] of guestServices.entries()) {
      for (const [sortOrder, item] of service.items.entries()) {
        const treatmentId = treatmentIdFor(item.key);
        await tx.spaTreatment.upsert({
          where: { id: treatmentId },
          create: {
            id: treatmentId,
            storeId: SPA_DEMO_STORE.id,
            name: item.name.replace("加購", ""),
            variantLabel: `${item.durationMinutes} 分鐘`,
            price: item.price,
            serviceMinutes: item.durationMinutes,
            bufferMinutes: sortOrder === service.items.length - 1 ? 30 : 0,
            publicVisible: false,
            sortOrder: 100 + sortOrder,
          },
          update: {
            name: item.name.replace("加購", ""),
            price: item.price,
            serviceMinutes: item.durationMinutes,
            bufferMinutes: sortOrder === service.items.length - 1 ? 30 : 0,
            isActive: true,
          },
        });
      }

      const bookingId = SPA_DEMO_LIVE_FLOW_BOOKING_IDS[guestIndex];
      const serviceName = service.items.map((item) => item.name.replace("加購", "")).join("＋");
      const requiredSpecialties = getRequiredSpecialties(service.items).join(",");
      await tx.spaBooking.create({
        data: {
          id: bookingId,
          storeId: SPA_DEMO_STORE.id,
          customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
          serviceStaffId: providerIds[guestIndex],
          revenueStaffId: providerIds[guestIndex],
          bookingDate: parseTaiwanDateToDbDate(data.bookingDate),
          startTime: data.slotTime,
          endTime: addMinutes(data.slotTime, service.summary.durationMinutes + 30),
          status: "CONFIRMED",
          serviceNameSnapshot: serviceName,
          totalPriceSnapshot: service.summary.price,
          requestKey: bookingId,
          partyGroupId: SPA_DEMO_LIVE_FLOW_BOOKING_ID,
          guestIndex: guestIndex + 1,
          notes: `SPA_DEMO_LIVE_FLOW|party=${people}|guest=${guestIndex + 1}|skills=${requiredSpecialties}`,
          items: {
            create: service.items.map((item, sortOrder) => ({
              storeId: SPA_DEMO_STORE.id,
              treatmentId: treatmentIdFor(item.key),
              treatmentNameSnapshot: item.name.replace("加購", ""),
              variantSnapshot: `${item.durationMinutes} 分鐘`,
              priceSnapshot: item.price,
              serviceMinutes: item.durationMinutes,
              bufferMinutes: sortOrder === service.items.length - 1 ? 30 : 0,
              sortOrder,
            })),
          },
        },
      });
    }
  });

  const notification: SpaDemoBookingNotification = {
    kind: data.bookingOperation === "UPDATE" ? "UPDATED" : "BOOKED",
    title: data.bookingOperation === "UPDATE" ? "預約已修改" : "預約成功",
    date: data.bookingDate,
    time: data.slotTime,
    lines: guestServices.map((service, index) => `${index === 0 ? "第 1 位" : `同行者 ${index + 1}`}・${service.items.map((item) => item.name.replace("加購", "")).join("＋")}・${service.summary.durationMinutes} 分鐘`),
    summary: `${people} 位・合計 NT$${guestServices.reduce((total, service) => total + service.summary.price, 0).toLocaleString()}`,
  };
  const notificationClaim = await prisma.$transaction((tx) =>
    saveSpaDemoBookingNotification(tx, SPA_DEMO_LIVE_FLOW_BOOKING_ID, notification),
  );
  await deliverSpaDemoBookingNotificationBestEffort(notificationClaim);

  revalidatePath("/liff/manager-preview");
  revalidatePath("/liff/design-preview/booking");
  revalidatePath("/liff/staff-preview");
  revalidatePath("/dashboard/spa-schedule");
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
      notification,
    },
  };
}
