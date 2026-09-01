"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { SPA_DEMO_STORE, assertSpaDemoStoreIdentity } from "@/lib/spa-demo-store";
import { isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import {
  getNowTaipeiHHmm,
  parseLocalDate,
  parseTaiwanDateToDbDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { calculateSpaProviderStartTimes } from "@/lib/spa-availability";
import { composeSpaBookingTreatments } from "@/lib/spa-booking-composition";
import { resolveSpaScheduleService } from "@/lib/spa-dashboard-schedule";
import type { ActionResult } from "@/types";
import {
  findSpaDemoCatalogItem,
  inferSpaDemoResourceType,
  SPA_DEMO_RESOURCE_CAPACITY,
  spaResourceLabel,
  type SpaDemoResourceType,
} from "@/lib/spa-demo-catalog";
import { isSpaResourceAvailable } from "@/lib/spa-resource-availability";
import { requireSpaStore } from "@/lib/industry-module-server";

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  treatmentIds: z.array(z.string().min(1)).min(1).max(8),
});

export type SpaBookingAvailability = {
  serviceMinutes: number;
  bufferMinutes: number;
  occupiedMinutes: number;
  totalPrice: number;
  resourceType: SpaDemoResourceType;
  resourceLabel: string;
  providers: Array<{
    id: string;
    displayName: string;
    colorCode: string;
    startTimes: string[];
  }>;
};

export async function fetchSpaBookingAvailability(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<SpaBookingAvailability>> {
  let context: { userId?: string; storeId?: string } = {};
  try {
    const user = await requirePermission("booking.create");
    const storeId = await resolveWriteStoreId(user);
    context = { userId: user.id, storeId };
    await requireSpaStore(storeId);
    if (storeId !== SPA_DEMO_STORE.id) {
      throw new AppError("FORBIDDEN", "此預約方式目前只開放 SPA Demo 驗收");
    }
    if (!(await isSpaOperationalSchemaReady())) {
      throw new AppError("CONFLICT", "SPA 資料功能更新中，請稍後再試");
    }
    const data = inputSchema.parse(input);
    if (new Set(data.treatmentIds).size !== data.treatmentIds.length) {
      throw new AppError("VALIDATION", "服務項目不可重複選擇");
    }

    const identity = await prisma.store.findUnique({
      where: { id: SPA_DEMO_STORE.id },
      select: { id: true, slug: true, isDemo: true },
    });
    assertSpaDemoStoreIdentity(identity);

    const [providers, occupiedBookings, dayContext] = await Promise.all([
      prisma.staff.findMany({
        where: { storeId, status: "ACTIVE", isOwner: false },
        select: {
          id: true,
          displayName: true,
          colorCode: true,
          skills: { select: { skill: { select: { id: true } } } },
          weeklyAvailabilities: {
            where: { dayOfWeek: parseLocalDate(data.date).getDay(), isActive: true },
            select: { startTime: true, endTime: true },
          },
          availabilityExceptions: {
            where: { date: parseTaiwanDateToDbDate(data.date) },
            select: { type: true, startTime: true, endTime: true },
          },
        },
        orderBy: { displayName: "asc" },
      }),
      prisma.booking.findMany({
        where: {
          storeId,
          bookingDate: parseTaiwanDateToDbDate(data.date),
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          serviceStaffId: { not: null },
        },
        select: {
          id: true,
          slotTime: true,
          serviceStaffId: true,
          treatmentId: true,
          treatmentNameSnapshot: true,
          treatmentServiceMinutesSnapshot: true,
          treatmentBufferMinutesSnapshot: true,
          servicePlan: { select: { name: true } },
          customerPlanWallet: { select: { plan: { select: { name: true } } } },
        },
      }),
      loadDayBusinessHoursContext(storeId, data.date),
    ]);

    const composition = composeSpaBookingTreatments(
      data.treatmentIds.map((id) => {
        const treatment = findSpaDemoCatalogItem(id);
        if (!treatment) throw new AppError("VALIDATION", "服務項目不存在或已停用");
        return {
          id: treatment.id,
          name: treatment.name,
          variantLabel: treatment.variant,
          price: treatment.price,
          serviceMinutes: treatment.serviceMinutes,
          bufferMinutes: treatment.bufferMinutes,
          skillKeys: [...treatment.skills],
          kind: treatment.kind,
          resourceType: treatment.resourceType,
        };
      }),
    );
    const candidateStartTimes = applySlotOverrides(
      dayContext.rule,
      dayContext.slotOverrides,
    )
      .filter((slot) => slot.isEnabled)
      .map((slot) => slot.startTime)
      .filter(
        (startTime) => data.date !== toLocalDateStr() || startTime > getNowTaipeiHHmm(),
      );

    return {
      success: true,
      data: {
        serviceMinutes: composition.serviceMinutes,
        bufferMinutes: composition.bufferMinutes,
        occupiedMinutes: composition.occupiedMinutes,
        totalPrice: composition.totalPrice,
        resourceType: composition.resourceType,
        resourceLabel: spaResourceLabel(composition.resourceType),
        providers: providers.map((provider) => ({
          id: provider.id,
          displayName: provider.displayName,
          colorCode: provider.colorCode ?? "#8fa89b",
          startTimes: calculateSpaProviderStartTimes({
            candidateStartTimes,
            businessCloseTime: dayContext.rule.closeTime ?? "21:00",
            serviceMinutes: composition.serviceMinutes,
            bufferMinutes: composition.bufferMinutes,
            requiredSkillKeys: composition.requiredSkillKeys,
            providerSkillKeys: provider.skills.map(({ skill }) =>
              skill.id.replace("spa-demo-skill-", ""),
            ),
            weeklyRanges: provider.weeklyAvailabilities,
            exceptions: provider.availabilityExceptions,
            occupiedRanges: occupiedBookings
              .filter((booking) => booking.serviceStaffId === provider.id)
              .map((booking) => ({
                startTime: booking.slotTime,
                durationMinutes:
                  (booking.treatmentServiceMinutesSnapshot ??
                    resolveSpaScheduleService({
                      bookingId: booking.id,
                      servicePlanName: booking.servicePlan?.name,
                      walletPlanName: booking.customerPlanWallet?.plan.name,
                    }).durationMinutes) +
                  (booking.treatmentBufferMinutesSnapshot ?? 0),
              })),
          }).filter((startTime) =>
            isSpaResourceAvailable({
              startTime,
              durationMinutes: composition.occupiedMinutes,
              resourceType: composition.resourceType,
              capacity: SPA_DEMO_RESOURCE_CAPACITY[composition.resourceType],
              occupiedRanges: occupiedBookings.map((booking) => ({
                startTime: booking.slotTime,
                durationMinutes:
                  (booking.treatmentServiceMinutesSnapshot ??
                    resolveSpaScheduleService({
                      bookingId: booking.id,
                      servicePlanName: booking.servicePlan?.name,
                      walletPlanName: booking.customerPlanWallet?.plan.name,
                    }).durationMinutes) +
                  (booking.treatmentBufferMinutesSnapshot ?? 0),
                resourceType: inferSpaDemoResourceType({
                  treatmentId: booking.treatmentId,
                  treatmentName: booking.treatmentNameSnapshot,
                }),
              })),
            }),
          ),
        })),
      },
    };
  } catch (error) {
    return handleActionError(error, context);
  }
}
