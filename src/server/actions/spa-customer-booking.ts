"use server";

import type { Prisma } from "../../../generated/spa-client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireSession } from "@/lib/session";
import { requireSpaStore } from "@/lib/industry-module-server";
import { isStoreBookableStatus, type StoreOperatingStatus } from "@/lib/store-operating-status";
import {
  getNowTaipeiHHmm,
  parseTaipeiDateTime,
  parseTaiwanDateToDbDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import {
  applySlotOverrides,
  loadDayBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import {
  applicableLocations,
  spaEndTime,
  staffAvailable,
} from "@/lib/spa-scheduling";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import type { ActionResult } from "@/types";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  treatmentIds: z.array(z.string().min(1)).min(1).max(8),
});

const createSchema = availabilitySchema.extend({
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  staffId: z.string().min(1).nullable(),
  requestKey: z.string().uuid(),
});

const cancelSchema = z.object({
  bookingId: z.string().min(1),
});

type CustomerBookingContext = {
  userId: string;
  storeId: string;
  storeSlug: string;
  customerId: string;
};

type TreatmentWithRules = Awaited<ReturnType<typeof loadTreatments>>[number];

async function requireCustomerBookingContext(): Promise<CustomerBookingContext> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER") {
    throw new AppError("FORBIDDEN", "請從會員入口使用預約功能");
  }

  const storeId = await resolveMemberRequestStoreId(user.storeId ?? null);
  if (!storeId) throw new AppError("UNAUTHORIZED", "缺少目前店舖，請重新開啟會員入口");
  await requireSpaStore(storeId);

  const [membership, store] = await Promise.all([
    resolveCentralMemberCustomerForStore(user.id, storeId),
    prisma.store.findUnique({
      where: { id: storeId },
      select: {
        slug: true,
        operatingStatus: true,
        moduleInstallation: { select: { status: true } },
      },
    }),
  ]);
  if (!membership) throw new AppError("FORBIDDEN", "此 LINE 帳號尚未連結本店會員");
  if (
    !store ||
    !isStoreBookableStatus(store.operatingStatus as StoreOperatingStatus) ||
    store.moduleInstallation?.status !== "ACTIVE"
  ) {
    throw new AppError("FORBIDDEN", "本店預約功能尚未開放");
  }

  return {
    userId: user.id,
    storeId,
    storeSlug: store.slug,
    customerId: membership.customerId,
  };
}

function assertBookableDate(date: string) {
  const today = toLocalDateStr();
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 60);
  if (date < today || date > latest.toISOString().slice(0, 10)) {
    throw new AppError("VALIDATION", "僅開放預約今天起 60 天內的日期");
  }
}

async function loadTreatments(
  tx: Prisma.TransactionClient | typeof spaPrisma,
  storeId: string,
  treatmentIds: string[],
) {
  if (new Set(treatmentIds).size !== treatmentIds.length) {
    throw new AppError("VALIDATION", "服務項目不可重複");
  }
  const treatments = await tx.spaTreatment.findMany({
    where: {
      storeId,
      id: { in: treatmentIds },
      isActive: true,
      publicVisible: true,
    },
    include: { skills: true, serviceLocations: true },
  });
  if (treatments.length !== treatmentIds.length) {
    throw new AppError("VALIDATION", "服務項目已停用、未公開或不屬於本店");
  }
  return treatmentIds.map((id) => treatments.find((treatment) => treatment.id === id)!);
}

function hasEverySkill(treatments: TreatmentWithRules[], skillIds: Set<string>) {
  return treatments.every((treatment) =>
    treatment.skills.every((skill) => skillIds.has(skill.skillId)),
  );
}

type AvailableAssignment = {
  staffId: string;
  staffName: string;
  locationId: string;
  locationName: string;
  endTime: string;
};

async function loadAssignmentResources(
  tx: Prisma.TransactionClient | typeof spaPrisma,
  input: {
    storeId: string;
    date: string;
    requestedStaffId?: string | null;
  },
){
  const bookingDate = parseTaiwanDateToDbDate(input.date);
  const [staff, staffSkills, regular, exceptions, locations, occupied] = await Promise.all([
    prisma.staff.findMany({
      where: {
        storeId: input.storeId,
        status: "ACTIVE",
        isOwner: false,
        ...(input.requestedStaffId ? { id: input.requestedStaffId } : {}),
      },
      select: { id: true, displayName: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.spaStaffSkill.findMany({ where: { storeId: input.storeId } }),
    tx.spaStaffAvailability.findMany({
      where: {
        storeId: input.storeId,
        dayOfWeek: bookingDate.getUTCDay(),
        isActive: true,
      },
    }),
    tx.spaStaffAvailabilityException.findMany({
      where: { storeId: input.storeId, date: bookingDate },
    }),
    tx.spaServiceLocation.findMany({
      where: { storeId: input.storeId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    tx.spaBooking.findMany({
      where: {
        storeId: input.storeId,
        bookingDate,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      },
      select: { serviceStaffId: true, serviceLocationId: true, startTime: true, endTime: true },
    }),
  ]);
  return { staff, staffSkills, regular, exceptions, locations, occupied };
}

type AssignmentResources = Awaited<ReturnType<typeof loadAssignmentResources>>;

async function reserveMatchingEntitlement(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    customerId: string;
    bookingId: string;
    bookingDate: Date;
    treatments: TreatmentWithRules[];
  },
) {
  if (input.treatments.length !== 1) return;
  const treatmentId = input.treatments[0].id;
  const today = parseTaiwanDateToDbDate(toLocalDateStr());
  const candidates = await tx.spaEntitlement.findMany({
    where: {
      storeId: input.storeId,
      customerId: input.customerId,
      treatmentId,
      status: "ACTIVE",
      remainingUses: { gte: 1 },
      startDate: { lte: today },
      OR: [{ expiryDate: null }, { expiryDate: { gte: input.bookingDate } }],
    },
    select: {
      id: true,
      remainingUses: true,
      uses: { where: { status: "RESERVED" }, select: { uses: true } },
    },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  const entitlement = candidates.find(
    (candidate) =>
      candidate.remainingUses -
        candidate.uses.reduce((sum, use) => sum + use.uses, 0) >=
      1,
  );
  if (!entitlement) return;
  await tx.spaEntitlementUse.create({
    data: {
      storeId: input.storeId,
      entitlementId: entitlement.id,
      bookingId: input.bookingId,
      uses: 1,
      status: "RESERVED",
    },
  });
}

function findAssignments(
  resources: AssignmentResources,
  input: {
    startTime: string;
    treatments: TreatmentWithRules[];
  },
): AvailableAssignment[] {
  const endTime = spaEndTime(input.startTime, input.treatments);
  const occupied = resources.occupied.filter(
    (booking) => booking.startTime < endTime && booking.endTime > input.startTime,
  );

  const allowedLocations = applicableLocations(
    resources.locations,
    input.treatments.map((treatment) =>
      treatment.serviceLocations.map((record) => record.serviceLocationId),
    ),
  );
  const occupiedStaff = new Set(occupied.map((booking) => booking.serviceStaffId));
  const occupiedLocations = new Set(
    occupied.flatMap((booking) => booking.serviceLocationId ? [booking.serviceLocationId] : []),
  );
  const freeLocations = allowedLocations.filter((location) => !occupiedLocations.has(location.id));
  if (freeLocations.length === 0) return [];

  return resources.staff.flatMap((person) => {
    const skills = new Set(
      resources.staffSkills.filter((skill) => skill.staffId === person.id).map((skill) => skill.skillId),
    );
    const range = resources.regular.find((item) => item.staffId === person.id) ?? null;
    const personExceptions = resources.exceptions.filter((item) => item.staffId === person.id);
    if (
      occupiedStaff.has(person.id) ||
      !hasEverySkill(input.treatments, skills) ||
      !staffAvailable(input.startTime, endTime, range, personExceptions)
    ) {
      return [];
    }
    return freeLocations.map((location) => ({
      staffId: person.id,
      staffName: person.displayName,
      locationId: location.id,
      locationName: location.name,
      endTime,
    }));
  });
}

export type SpaCustomerAvailability = {
  options: Array<{
    startTime: string;
    providers: Array<{ id: string; name: string }>;
  }>;
};

export async function fetchSpaCustomerAvailability(
  input: z.infer<typeof availabilitySchema>,
): Promise<ActionResult<SpaCustomerAvailability>> {
  try {
    const context = await requireCustomerBookingContext();
    const data = availabilitySchema.parse(input);
    assertBookableDate(data.date);
    const treatments = await loadTreatments(spaPrisma, context.storeId, data.treatmentIds);
    const day = await loadDayBusinessHoursContext(context.storeId, data.date);
    const candidateTimes = applySlotOverrides(day.rule, day.slotOverrides)
      .filter((slot) => slot.isEnabled)
      .map((slot) => slot.startTime)
      .filter((time) => data.date !== toLocalDateStr() || time > getNowTaipeiHHmm());

    const resources = await loadAssignmentResources(spaPrisma, {
      storeId: context.storeId,
      date: data.date,
    });
    const options = [];
    for (const startTime of candidateTimes) {
      const assignments = findAssignments(resources, {
        startTime,
        treatments,
      });
      const providers = [...new Map(
        assignments.map((assignment) => [
          assignment.staffId,
          { id: assignment.staffId, name: assignment.staffName },
        ]),
      ).values()];
      if (providers.length > 0) options.push({ startTime, providers });
    }
    return { success: true, data: { options } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createSpaCustomerBooking(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{
  bookingId: string;
  staffName: string;
  locationName: string;
  serviceName: string;
  endTime: string;
}>> {
  try {
    const context = await requireCustomerBookingContext();
    const data = createSchema.parse(input);
    assertBookableDate(data.date);

    const result = await spaPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${context.storeId}`}, 0))`;
      const duplicate = await tx.spaBooking.findUnique({
        where: { storeId_requestKey: { storeId: context.storeId, requestKey: data.requestKey } },
        select: {
          id: true,
          serviceNameSnapshot: true,
          endTime: true,
          serviceStaffId: true,
          serviceLocationId: true,
        },
      });
      if (duplicate) {
        const [staff, location] = await Promise.all([
          prisma.staff.findFirst({
            where: { id: duplicate.serviceStaffId, storeId: context.storeId },
            select: { displayName: true },
          }),
          duplicate.serviceLocationId
            ? tx.spaServiceLocation.findFirst({
                where: { id: duplicate.serviceLocationId, storeId: context.storeId },
                select: { name: true },
              })
            : Promise.resolve(null),
        ]);
        return {
          bookingId: duplicate.id,
          staffName: staff?.displayName ?? "服務人員",
          locationName: location?.name ?? "待安排位置",
          serviceName: duplicate.serviceNameSnapshot,
          endTime: duplicate.endTime,
        };
      }

      const treatments = await loadTreatments(tx, context.storeId, data.treatmentIds);
      const resources = await loadAssignmentResources(tx, {
        storeId: context.storeId,
        date: data.date,
        requestedStaffId: data.staffId,
      });
      const assignments = findAssignments(resources, {
        startTime: data.startTime,
        treatments,
      });
      const assignment = assignments[0];
      if (!assignment) {
        throw new AppError(
          "CONFLICT",
          data.staffId
            ? "此服務人員或服務位置剛被預約，請改選其他時段"
            : "此時段剛被預約，請改選其他時段",
        );
      }

      const serviceName = treatments.map((treatment) => treatment.name).join("＋");
      const bookingDate = parseTaiwanDateToDbDate(data.date);
      const booking = await tx.spaBooking.create({
        data: {
          storeId: context.storeId,
          customerId: context.customerId,
          serviceStaffId: assignment.staffId,
          revenueStaffId: assignment.staffId,
          serviceLocationId: assignment.locationId,
          bookingDate,
          startTime: data.startTime,
          endTime: assignment.endTime,
          status: "CONFIRMED",
          serviceNameSnapshot: serviceName,
          totalPriceSnapshot: treatments.reduce(
            (sum, treatment) => sum + Number(treatment.price),
            0,
          ),
          requestKey: data.requestKey,
        },
        select: { id: true },
      });
      await tx.spaBookingItem.createMany({
        data: treatments.map((treatment, sortOrder) => ({
          storeId: context.storeId,
          bookingId: booking.id,
          treatmentId: treatment.id,
          treatmentNameSnapshot: treatment.name,
          variantSnapshot: treatment.variantLabel,
          priceSnapshot: treatment.price,
          serviceMinutes: treatment.serviceMinutes,
          bufferMinutes: treatment.bufferMinutes,
          sortOrder,
        })),
      });
      await reserveMatchingEntitlement(tx, {
        storeId: context.storeId,
        customerId: context.customerId,
        bookingId: booking.id,
        bookingDate,
        treatments,
      });
      return {
        bookingId: booking.id,
        staffName: assignment.staffName,
        locationName: assignment.locationName,
        serviceName,
        endTime: assignment.endTime,
      };
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    revalidatePath(`/s/${context.storeSlug}/book`);
    revalidatePath(`/s/${context.storeSlug}/book/new`);
    revalidatePath(`/s/${context.storeSlug}/my-bookings`);
    revalidatePath(`/s/${context.storeSlug}/admin/dashboard/spa-schedule`);
    revalidatePath(`/s/${context.storeSlug}/liff/spa-work`);
    return { success: true, data: result };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const message = error instanceof Error ? error.message : "";
    if (code === "P2034" || code === "P2002" || /23P01|no_overlap/.test(message)) {
      return { success: false, error: "時段剛被其他人預約，請重新選擇；目前內容已保留" };
    }
    return handleActionError(error);
  }
}

export async function cancelSpaCustomerBooking(
  input: z.infer<typeof cancelSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  try {
    const context = await requireCustomerBookingContext();
    const data = cancelSchema.parse(input);
    await spaPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${context.storeId}`}, 0))`;
      const booking = await tx.spaBooking.findFirst({
        where: {
          id: data.bookingId,
          storeId: context.storeId,
          customerId: context.customerId,
        },
        select: { id: true, status: true, bookingDate: true, startTime: true },
      });
      if (!booking) throw new AppError("NOT_FOUND", "找不到這筆預約");
      if (booking.status === "CANCELLED") return;
      if (!ACTIVE_BOOKING_STATUSES.includes(booking.status as typeof ACTIVE_BOOKING_STATUSES[number])) {
        throw new AppError("CONFLICT", "此預約目前無法取消");
      }
      const bookingDate = booking.bookingDate.toISOString().slice(0, 10);
      const bookingAt = parseTaipeiDateTime(bookingDate, booking.startTime);
      if (!bookingAt || bookingAt.getTime() - Date.now() < 12 * 60 * 60 * 1000) {
        throw new AppError("CONFLICT", "服務開始前 12 小時內無法自行取消，請聯繫店家");
      }
      await tx.spaBooking.update({
        where: { id_storeId: { id: booking.id, storeId: context.storeId } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      await tx.spaEntitlementUse.updateMany({
        where: {
          storeId: context.storeId,
          bookingId: booking.id,
          status: "RESERVED",
        },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    });

    revalidatePath(`/s/${context.storeSlug}/book`);
    revalidatePath(`/s/${context.storeSlug}/book/new`);
    revalidatePath(`/s/${context.storeSlug}/my-bookings`);
    revalidatePath(`/s/${context.storeSlug}/admin/dashboard/spa-schedule`);
    revalidatePath(`/s/${context.storeSlug}/liff/spa-work`);
    return { success: true, data: { bookingId: data.bookingId } };
  } catch (error) {
    return handleActionError(error);
  }
}
