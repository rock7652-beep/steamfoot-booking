import "server-only";

import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_BOOKINGS,
  SPA_DEMO_FIXTURE,
  SPA_DEMO_LIVE_FLOW_BOOKING_IDS,
  SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
  SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME,
  SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID,
  SPA_DEMO_PROVIDERS,
  SPA_DEMO_STORE,
  type SpaDemoBooking,
  type SpaDemoBookingStatus,
  type SpaDemoPreviewData,
  type SpaDemoTone,
  type SpaDemoBookingNotification,
} from "@/lib/spa-demo-store";
import { isSpaCompensationSchemaReady } from "@/lib/spa-schema-readiness";

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

function parseSpaDemoNotification(renderedBody: string | null): SpaDemoBookingNotification | null {
  if (!renderedBody) return null;
  try {
    const value = JSON.parse(renderedBody) as Partial<SpaDemoBookingNotification>;
    if (!(["BOOKED", "UPDATED", "CANCELLED", "REMINDER"] as const).includes(value.kind as SpaDemoBookingNotification["kind"])) return null;
    if (typeof value.title !== "string" || typeof value.date !== "string" || typeof value.time !== "string" || typeof value.summary !== "string") return null;
    if (!Array.isArray(value.lines) || value.lines.some((line) => typeof line !== "string")) return null;
    return value as SpaDemoBookingNotification;
  } catch {
    return null;
  }
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
    const today = toLocalDateStr();
    return {
      ...SPA_DEMO_FIXTURE,
      bookings: SPA_DEMO_FIXTURE.bookings.map((booking) => (
        booking.date < today && booking.status !== "已完成"
          ? { ...booking, status: "待補登" as const, tone: "sand" as const }
          : booking
      )),
    };
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

  const compensationReady = await isSpaCompensationSchemaReady();
  const [staff, staffSkills, weeklyAvailabilities, availabilityExceptions, bookings, liveStoredWallet, livePackageWallet, notificationLog, compensationSettings] = await Promise.all([
    prisma.staff.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        status: "ACTIVE",
        isOwner: false,
      },
      select: {
        id: true,
        displayName: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    spaPrisma.spaStaffSkill.findMany({ where: { storeId: SPA_DEMO_STORE.id }, select: { staffId: true, skillId: true, skill: { select: { name: true } } } }),
    spaPrisma.spaStaffAvailability.findMany({ where: { storeId: SPA_DEMO_STORE.id, isActive: true }, select: { staffId: true, dayOfWeek: true, startTime: true, endTime: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    spaPrisma.spaStaffAvailabilityException.findMany({ where: { storeId: SPA_DEMO_STORE.id, date: { gte: parseTaiwanDateToDbDate(toLocalDateStr()) } }, select: { staffId: true, date: true, type: true, reason: true, startTime: true, endTime: true }, orderBy: { date: "asc" } }),
    spaPrisma.spaBooking.findMany({
      where: {
        storeId: SPA_DEMO_STORE.id,
        id: { in: [...SPA_DEMO_BOOKINGS.map((booking) => booking.id), ...SPA_DEMO_LIVE_FLOW_BOOKING_IDS] },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        bookingDate: true,
        startTime: true,
        status: true,
        notes: true,
        serviceStaffId: true,
        serviceNameSnapshot: true,
        totalPriceSnapshot: true,
        partyGroupId: true,
        guestIndex: true,
        items: { orderBy: { sortOrder: "asc" } },
        payments: {
          where: { refundOfPaymentId: null, status: { in: ["SUCCESS", "REFUNDED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { refunds: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" } } },
        },
      },
      orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
    }),
    spaPrisma.spaStoredValueWallet.findFirst({
      where: { storeId: SPA_DEMO_STORE.id, customerId: "spa-demo-customer-live-flow" },
      select: { balance: true },
    }),
    spaPrisma.spaEntitlement.findFirst({
      where: { id: SPA_DEMO_LIVE_FLOW_PACKAGE_WALLET_ID, storeId: SPA_DEMO_STORE.id },
      select: { remainingUses: true },
    }),
    prisma.messageLog.findFirst({
      where: {
        id: { startsWith: SPA_DEMO_LIVE_FLOW_NOTIFICATION_ID },
        storeId: SPA_DEMO_STORE.id,
        customerId: SPA_DEMO_LIVE_FLOW_CUSTOMER_ID,
      },
      select: { renderedBody: true, status: true, errorMessage: true },
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    compensationReady
      ? spaPrisma.spaStaffCompensation.findMany({
          where: { storeId: SPA_DEMO_STORE.id, isActive: true },
          select: { staffId: true, mode: true, value: true },
        })
      : Promise.resolve([]),
  ]);

  const providers = staff.map((record) => {
    const fixture = SPA_DEMO_PROVIDERS.find((provider) => provider.id === record.id);
    const badgeMatch = record.displayName.match(/^(\d+)號\s*/);
    const recordSkills = staffSkills.filter((skill) => skill.staffId === record.id);
    const specialtyKeys = recordSkills
      .map((row) => row.skillId.replace("spa-demo-skill-", ""))
      .filter((key): key is "body" | "head" | "foot" | "face" => ["body", "head", "foot", "face"].includes(key));
    const compensation = compensationSettings.find((setting) => setting.staffId === record.id);
    const compensationMode: "PERCENTAGE" | "FIXED" | null = compensation?.mode === "PERCENTAGE" || compensation?.mode === "FIXED"
      ? compensation.mode
      : null;
    return {
      id: record.id,
      badge: badgeMatch?.[1] ?? record.displayName.slice(0, 2),
      name: record.displayName.replace(/^\d+號\s*/, ""),
      specialties: recordSkills.map((row) => row.skill.name).join("・") || "尚未設定專業項目",
      specialtyKeys,
      compensationMode,
      compensationValue: compensation ? Number(compensation.value) : null,
      emergencyContact: fixture?.emergencyContact ?? { name: "", relation: "", phone: "" },
      weeklyAvailability: weeklyAvailabilities.filter((availability) => availability.staffId === record.id),
      scheduleExceptions: availabilityExceptions.filter((exception) => exception.staffId === record.id).map((exception) => ({
        date: toLocalDateStr(exception.date),
        label: exception.type === "UNAVAILABLE"
          ? exception.startTime && exception.endTime
            ? `請假 ${exception.startTime}–${exception.endTime}${exception.reason ? `・${exception.reason}` : ""}`
            : exception.reason || "個人休假"
          : `臨時加班 ${exception.startTime}–${exception.endTime}${exception.reason ? `・${exception.reason}` : ""}`,
        tone: exception.type === "UNAVAILABLE" ? "leave" as const : "extra" as const,
        startTime: exception.startTime,
        endTime: exception.endTime,
      })),
    };
  });

  const today = toLocalDateStr();
  const mappedBookings: SpaDemoBooking[] = bookings.map((record) => {
    const fixture = SPA_DEMO_BOOKINGS.find((booking) => booking.id === record.id);
    const isLiveFlow = SPA_DEMO_LIVE_FLOW_BOOKING_IDS.includes(
      record.id as (typeof SPA_DEMO_LIVE_FLOW_BOOKING_IDS)[number],
    );
    if (!fixture && !isLiveFlow) throw new Error(`SPA_DEMO_BOOKING_NOT_ALLOWLISTED:${record.id}`);
    if (!staff.some((provider) => provider.id === record.serviceStaffId)) {
      throw new Error(`SPA_DEMO_CROSS_STORE_RELATION_REJECTED:${record.id}`);
    }
    const bookingDate = toLocalDateStr(record.bookingDate);
    const originalStatus = STATUS_MAP[record.status] ?? "已確認";
    const status: SpaDemoBookingStatus = bookingDate < today && originalStatus !== "已完成"
      ? "待補登"
      : originalStatus;
    if (isLiveFlow) {
      const payment = record.payments[0];
      const refund = payment?.refunds[0];
      const settlement = record.notes?.match(/\|label=([^|]+)\|amount=(\d+)/);
      const refundAmount = refund ? Number(refund.netAmount) : Number.NaN;
      const refundReason = refund?.refundReason ?? null;
      const refundedAt = refund?.refundedAt?.toISOString() ?? null;
      const settlementScope = record.notes?.match(/\|checkout=(GROUP|INDIVIDUAL)\|/)?.[1] as "GROUP" | "INDIVIDUAL" | undefined;
      const partySize = Number(record.notes?.match(/\|party=(\d+)/)?.[1] ?? 1);
      const guestIndex = record.guestIndex;
      const serviceMinutes = record.items.reduce((sum, item) => sum + item.serviceMinutes, 0) || 60;
      const bufferMinutes = record.items.reduce((sum, item) => sum + item.bufferMinutes, 0);
      return {
        id: record.id,
        date: bookingDate,
        time: record.startTime,
        customer: SPA_DEMO_LIVE_FLOW_CUSTOMER_NAME,
        service: record.serviceNameSnapshot,
        serviceItems: record.items.map((item) => item.treatmentNameSnapshot),
        providerId: record.serviceStaffId ?? providers[0]?.id ?? SPA_DEMO_PROVIDERS[0].id,
        durationMinutes: serviceMinutes,
        bufferMinutes,
        status,
        tone: toneForStatus(status),
        remainingSessions: null,
        note: "無",
        settlementLabel: settlement?.[1] ?? null,
        settlementAmount: settlement ? Number(settlement[2]) : null,
        settlementScope: settlementScope ?? null,
        refundAmount: Number.isFinite(refundAmount) ? refundAmount : null,
        refundReason,
        refundedAt,
        storedValueBalance: liveStoredWallet ? Number(liveStoredWallet.balance) : null,
        packageRemainingSessions: livePackageWallet?.remainingUses ?? null,
        partySize,
        guestIndex,
        price: Number(record.totalPriceSnapshot),
        contactPhone: "0911999999",
      };
    }
    return {
      ...fixture!,
      date: bookingDate,
      time: record.startTime,
      customer: fixture!.customer,
      service: record.serviceNameSnapshot,
      providerId: record.serviceStaffId ?? fixture!.providerId,
      status,
      tone: toneForStatus(status),
      remainingSessions: fixture!.remainingSessions,
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
    notification: (() => {
      const notification = parseSpaDemoNotification(notificationLog?.renderedBody ?? null);
      return notification && notificationLog
        ? {
            ...notification,
            deliveryStatus: notificationLog.errorMessage === "SPA_DEMO_SIMULATED_DELIVERY"
              ? "SIMULATED" as const
              : notificationLog.status,
          }
        : notification;
    })(),
    source: "database",
  };
}
