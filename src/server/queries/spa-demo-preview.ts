import "server-only";

import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_FIXTURE,
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
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
        status: "ACTIVE",
        isOwner: false,
      },
      select: {
        id: true,
        displayName: true,
        skills: {
          where: { storeId: SPA_DEMO_STORE.id, skill: { isActive: true } },
          select: { skillId: true, skill: { select: { name: true } } },
        },
        weeklyAvailabilities: {
          where: { storeId: SPA_DEMO_STORE.id, isActive: true },
          select: { dayOfWeek: true, startTime: true, endTime: true },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
        availabilityExceptions: {
          where: { storeId: SPA_DEMO_STORE.id, date: { gte: parseTaiwanDateToDbDate(toLocalDateStr()) } },
          select: { date: true, type: true, reason: true, startTime: true, endTime: true },
          orderBy: { date: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        id: { in: [...SPA_DEMO_BOOKINGS.map((booking) => booking.id), ...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] },
        bookingStatus: { not: "CANCELLED" },
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
        customer: { select: { name: true, phone: true, storeId: true } },
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
    const badgeMatch = record.displayName.match(/^(\d+)號\s*/);
    const specialtyKeys = record.skills
      .map((row) => row.skillId.replace("spa-demo-skill-", ""))
      .filter((key): key is "body" | "head" | "foot" | "face" => ["body", "head", "foot", "face"].includes(key));
    return {
      id: record.id,
      badge: badgeMatch?.[1] ?? record.displayName.slice(0, 2),
      name: record.displayName.replace(/^\d+號\s*/, ""),
      specialties: record.skills.map((row) => row.skill.name).join("・") || "尚未設定專業項目",
      specialtyKeys,
      emergencyContact: fixture?.emergencyContact ?? { name: "", relation: "", phone: "" },
      weeklyAvailability: record.weeklyAvailabilities,
      scheduleExceptions: record.availabilityExceptions.map((exception) => ({
        date: toLocalDateStr(exception.date),
        label: exception.type === "UNAVAILABLE"
          ? exception.reason || "個人休假"
          : `臨時加班 ${exception.startTime}–${exception.endTime}`,
        tone: exception.type === "UNAVAILABLE" ? "leave" as const : "extra" as const,
        startTime: exception.startTime,
        endTime: exception.endTime,
      })),
    };
  });

  const mappedBookings: SpaDemoBooking[] = bookings.map((record) => {
    const fixture = SPA_DEMO_BOOKINGS.find((booking) => booking.id === record.id);
    const isLiveFlow = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(
      record.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number],
    );
    if (!fixture && !isLiveFlow) throw new Error(`SPA_DEMO_BOOKING_NOT_ALLOWLISTED:${record.id}`);
    if (
      record.customer.storeId !== SPA_DEMO_STORE.id ||
      (record.servicePlan && record.servicePlan.storeId !== SPA_DEMO_STORE.id) ||
      (record.customerPlanWallet && record.customerPlanWallet.storeId !== SPA_DEMO_STORE.id) ||
      (record.serviceStaffId && !staff.some((provider) => provider.id === record.serviceStaffId))
    ) {
      throw new Error(`SPA_DEMO_CROSS_STORE_RELATION_REJECTED:${record.id}`);
    }
    const status = record.bookingType === "FIRST_TRIAL"
      ? "新客體驗"
      : STATUS_MAP[record.bookingStatus] ?? "已確認";
    if (isLiveFlow) {
      const settlement = record.notes?.match(/\|label=([^|]+)\|amount=(\d+)/);
      const partySize = Number(record.notes?.match(/\|party=(\d+)/)?.[1] ?? 1);
      const guestIndex = Number(record.notes?.match(/\|guest=(\d+)/)?.[1] ?? 1);
      return {
        id: record.id,
        date: toLocalDateStr(record.bookingDate),
        time: record.slotTime,
        customer: record.customer.name,
        service: record.treatmentNameSnapshot ?? record.servicePlan?.name ?? "SPA 服務",
        serviceItems: (record.treatmentNameSnapshot ?? "SPA 服務").split("＋"),
        providerId: record.serviceStaffId ?? providers[0]?.id ?? SPA_DEMO_PROVIDERS[0].id,
        durationMinutes: record.treatmentServiceMinutesSnapshot ?? 60,
        bufferMinutes: record.treatmentBufferMinutesSnapshot ?? 30,
        status,
        tone: toneForStatus(status),
        remainingSessions: null,
        note: "無",
        settlementLabel: settlement?.[1] ?? null,
        settlementAmount: settlement ? Number(settlement[2]) : null,
        storedValueBalance: liveStoredWallet ? Number(liveStoredWallet.balance) : null,
        packageRemainingSessions: livePackageWallet?.remainingSessions ?? null,
        partySize,
        guestIndex,
        price: Number(record.treatmentPriceSnapshot ?? 0),
        contactPhone: record.customer.phone ?? "",
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
