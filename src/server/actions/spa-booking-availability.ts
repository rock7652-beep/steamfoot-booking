"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
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
import type { ActionResult } from "@/types";
import {
  inferSpaDemoResourceType,
  SPA_DEMO_RESOURCE_CAPACITY,
  spaResourceLabel,
  type SpaDemoResourceType,
} from "@/lib/spa-demo-catalog";
import { isSpaResourceAvailable } from "@/lib/spa-resource-availability";
import { requireSpaStore } from "@/lib/industry-module-server";
import {
  inferSpaTreatmentKind,
  isSpaSkillKey,
  spaSkillKeyFromId,
} from "@/lib/spa-store-identifiers";

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
    if (!(await isSpaOperationalSchemaReady())) {
      throw new AppError("CONFLICT", "SPA 資料功能更新中，請稍後再試");
    }
    const data = inputSchema.parse(input);
    if (new Set(data.treatmentIds).size !== data.treatmentIds.length) {
      throw new AppError("VALIDATION", "服務項目不可重複選擇");
    }

    const [providers, staffSkills, weeklyAvailabilities, availabilityExceptions, occupiedBookings, dayContext, treatments] = await Promise.all([
      prisma.staff.findMany({
        where: { storeId, status: "ACTIVE", isOwner: false },
        select: {
          id: true,
          displayName: true,
          colorCode: true,
        },
        orderBy: { displayName: "asc" },
      }),
      spaPrisma.spaStaffSkill.findMany({ where: { storeId }, select: { staffId: true, skillId: true } }),
      spaPrisma.spaStaffAvailability.findMany({ where: { storeId, dayOfWeek: parseLocalDate(data.date).getDay(), isActive: true }, select: { staffId: true, startTime: true, endTime: true } }),
      spaPrisma.spaStaffAvailabilityException.findMany({ where: { storeId, date: parseTaiwanDateToDbDate(data.date) }, select: { staffId: true, type: true, startTime: true, endTime: true } }),
      spaPrisma.spaBooking.findMany({
        where: {
          storeId,
          bookingDate: parseTaiwanDateToDbDate(data.date),
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: {
          id: true,
          startTime: true,
          serviceStaffId: true,
          items: { select: { treatmentId: true, treatmentNameSnapshot: true, serviceMinutes: true, bufferMinutes: true } },
        },
      }),
      loadDayBusinessHoursContext(storeId, data.date),
      spaPrisma.spaTreatment.findMany({
        where: {
          id: { in: data.treatmentIds },
          storeId,
          isActive: true,
        },
        include: {
          skills: { select: { skill: { select: { id: true } } } },
        },
      }),
    ]);
    if (treatments.length !== data.treatmentIds.length) {
      throw new AppError("VALIDATION", "服務項目不存在、已停用或不屬於本店");
    }
    const treatmentById = new Map(treatments.map((item) => [item.id, item]));

    const composition = composeSpaBookingTreatments(
      data.treatmentIds.map((id) => {
        const treatment = treatmentById.get(id)!;
        return {
          id: treatment.id,
          name: treatment.name,
          variantLabel: treatment.variantLabel,
          price: Number(treatment.price),
          serviceMinutes: treatment.serviceMinutes,
          bufferMinutes: treatment.bufferMinutes,
          skillKeys: treatment.skills
            .map(({ skill }) => spaSkillKeyFromId(skill.id))
            .filter(isSpaSkillKey),
          kind: inferSpaTreatmentKind(treatment.name),
          resourceType: inferSpaDemoResourceType({
            treatmentId: treatment.id,
            treatmentName: treatment.name,
          }),
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
            providerSkillKeys: staffSkills
              .filter((skill) => skill.staffId === provider.id)
              .map((skill) => spaSkillKeyFromId(skill.skillId))
              .filter(isSpaSkillKey),
            weeklyRanges: weeklyAvailabilities.filter((range) => range.staffId === provider.id),
            exceptions: availabilityExceptions.filter((exception) => exception.staffId === provider.id),
            occupiedRanges: occupiedBookings
              .filter((booking) => booking.serviceStaffId === provider.id)
              .map((booking) => ({
                startTime: booking.startTime,
                durationMinutes: booking.items.reduce((sum, item) => sum + item.serviceMinutes + item.bufferMinutes, 0),
              })),
          }).filter((startTime) =>
            isSpaResourceAvailable({
              startTime,
              durationMinutes: composition.occupiedMinutes,
              resourceType: composition.resourceType,
              capacity: SPA_DEMO_RESOURCE_CAPACITY[composition.resourceType],
              occupiedRanges: occupiedBookings.map((booking) => ({
                startTime: booking.startTime,
                durationMinutes: booking.items.reduce((sum, item) => sum + item.serviceMinutes + item.bufferMinutes, 0),
                resourceType: inferSpaDemoResourceType({
                  treatmentId: booking.items[0]?.treatmentId,
                  treatmentName: booking.items[0]?.treatmentNameSnapshot,
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
