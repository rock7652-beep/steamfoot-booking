import "server-only";

import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_FIXTURE,
  SPA_DEMO_LIVE_FLOW_BOOKING_ID,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_PROVIDERS,
  SPA_DEMO_STORE,
  type SpaDemoBooking,
  type SpaDemoBookingStatus,
  type SpaDemoPreviewData,
  type SpaDemoTone,
} from "@/lib/spa-demo-store";

const STATUS_MAP: Record<string, SpaDemoBookingStatus> = {
  PENDING: "待到店",
  CONFIRMED: "已確認",
  CHECKED_IN: "已到店",
  COMPLETED: "已完成",
};

function toneForStatus(status: SpaDemoBookingStatus): SpaDemoTone {
  if (status === "新客體驗") return "rose";
  if (status === "待到店") return "sand";
  if (status === "已完成") return "slate";
  return "sage";
}

/**
 * Vercel Preview reads the isolated Demo tenant after its Seed is installed.
 * Local/test environments stay on fixtures unless explicitly enabled. Every
 * database query remains pinned to the one immutable Demo store id.
 */
export async function getSpaDemoPreviewData(): Promise<SpaDemoPreviewData> {
  const databasePreviewEnabled =
    process.env.VERCEL_ENV === "preview" ||
    process.env.SPA_DEMO_DATABASE_PREVIEW_ENABLED === "true";
  if (!databasePreviewEnabled) {
    return SPA_DEMO_FIXTURE;
  }

  const store = await prisma.store.findFirst({
    where: {
      OR: [{ id: SPA_DEMO_STORE.id }, { slug: SPA_DEMO_STORE.slug }],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      isDemo: true,
      shopConfig: { select: { address: true, mapUrl: true } },
    },
  });
  assertSpaDemoStoreIdentity(store);

  const [staff, bookings, liveStoredWallet, livePackageWallet] = await Promise.all([
    prisma.staff.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        id: { in: SPA_DEMO_PROVIDERS.map((provider) => provider.id) },
        status: "ACTIVE",
        isOwner: false,
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        id: { in: [...SPA_DEMO_BOOKINGS.map((booking) => booking.id), SPA_DEMO_LIVE_FLOW_BOOKING_ID] },
      },
      select: {
        id: true,
        bookingDate: true,
        slotTime: true,
        bookingStatus: true,
        bookingType: true,
        notes: true,
        serviceStaffId: true,
        treatmentNameSnapshot: true,
        treatmentVariantSnapshot: true,
        treatmentPriceSnapshot: true,
        treatmentServiceMinutesSnapshot: true,
        treatmentBufferMinutesSnapshot: true,
        customer: { select: { name: true, storeId: true } },
        servicePlan: { select: { name: true, storeId: true } },
        customerPlanWallet: { select: { remainingSessions: true, storeId: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
    }),
    prisma.storedValueWallet.findFirst({
      where: { storeId: SPA_DEMO_STORE.id, customerId: "spa-demo-customer-live-flow" },
      select: { balance: true },
    }),
    prisma.customerPlanWallet.findFirst({
      where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID, storeId: SPA_DEMO_STORE.id },
      select: { remainingSessions: true },
    }),
  ]);

  const providers = staff.map((record) => {
    const fixture = SPA_DEMO_PROVIDERS.find((provider) => provider.id === record.id);
    if (!fixture) throw new Error(`SPA_DEMO_PROVIDER_NOT_ALLOWLISTED:${record.id}`);
    return { ...fixture, name: record.displayName.replace(/^\d+號\s*/, "") };
  });

  const mappedBookings: SpaDemoBooking[] = bookings.map((record) => {
    const fixture = SPA_DEMO_BOOKINGS.find((booking) => booking.id === record.id);
    const isLiveFlow = record.id === SPA_DEMO_LIVE_FLOW_BOOKING_ID;
    if (!fixture && !isLiveFlow) throw new Error(`SPA_DEMO_BOOKING_NOT_ALLOWLISTED:${record.id}`);
    if (
      record.customer.storeId !== SPA_DEMO_STORE.id ||
      (record.servicePlan && record.servicePlan.storeId !== SPA_DEMO_STORE.id) ||
      (record.customerPlanWallet && record.customerPlanWallet.storeId !== SPA_DEMO_STORE.id) ||
      (record.serviceStaffId && !SPA_DEMO_PROVIDERS.some((provider) => provider.id === record.serviceStaffId))
    ) {
      throw new Error(`SPA_DEMO_CROSS_STORE_RELATION_REJECTED:${record.id}`);
    }
    const status = record.bookingType === "FIRST_TRIAL"
      ? "新客體驗"
      : STATUS_MAP[record.bookingStatus] ?? "已確認";
    if (isLiveFlow) {
      const settlement = record.notes?.match(/\|label=([^|]+)\|amount=(\d+)/);
      return {
        id: record.id,
        date: toLocalDateStr(record.bookingDate),
        time: record.slotTime,
        customer: record.customer.name,
        service: record.treatmentNameSnapshot ?? record.servicePlan?.name ?? "SPA 服務",
        serviceItems: (record.treatmentNameSnapshot ?? "SPA 服務").split("＋"),
        providerId: record.serviceStaffId ?? SPA_DEMO_PROVIDERS[0].id,
        durationMinutes: record.treatmentServiceMinutesSnapshot ?? 60,
        bufferMinutes: record.treatmentBufferMinutesSnapshot ?? 30,
        status,
        tone: toneForStatus(status),
        remainingSessions: null,
        note: "顧客端送出，店長與芳療師同步驗收",
        settlementLabel: settlement?.[1] ?? null,
        settlementAmount: settlement ? Number(settlement[2]) : null,
        storedValueBalance: liveStoredWallet ? Number(liveStoredWallet.balance) : null,
        packageRemainingSessions: livePackageWallet?.remainingSessions ?? null,
      };
    }
    return {
      ...fixture!,
      date: toLocalDateStr(record.bookingDate),
      time: record.slotTime,
      customer: record.customer.name,
      service: fixture!.serviceItems.length > 1
        ? fixture!.service
        : record.servicePlan?.name ?? fixture!.service,
      providerId: record.serviceStaffId ?? fixture!.providerId,
      status,
      tone: toneForStatus(status),
      remainingSessions: record.customerPlanWallet?.remainingSessions ?? fixture!.remainingSessions,
      note: record.notes?.replace(/^SPA_DEMO\|/, "") ?? fixture!.note,
    };
  });

  return {
    presentation: {
      ...SPA_DEMO_STORE,
      name: store.name,
      address: store.shopConfig?.address ?? SPA_DEMO_STORE.address,
      mapUrl: store.shopConfig?.mapUrl ?? SPA_DEMO_STORE.mapUrl,
    },
    providers,
    bookings: mappedBookings,
    source: "database",
  };
}
