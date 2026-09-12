"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { spaPrisma } from "@/lib/spa-db";
import { prisma } from "@/lib/db";
import type { Prisma } from "../../../generated/spa-client";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import {
  spaEndTime,
  staffAvailable,
  validSpaDate,
  minutesOf,
  timeOf,
  overlaps,
} from "@/lib/spa-scheduling";
// A private one-to-one capability per service encodes the direct relation in the
// existing isolated SPA tables. Existing category-based eligibility is copied on
// the first edit; changing a service never changes another service's providers.
async function setProviders(
  tx: Prisma.TransactionClient,
  storeId: string,
  treatmentId: string,
  staffIds: string[],
) {
  const id = `spa-service:${treatmentId}`;
  const capability = await tx.spaSkill.findUnique({ where: { id } });
  if (capability && capability.storeId !== storeId)
    throw new AppError("FORBIDDEN", "服務關聯店別不符");
  await tx.spaSkill.upsert({
    where: { id },
    create: { id, storeId, name: `__service__:${treatmentId}`, isActive: true },
    update: { isActive: true },
  });
  await tx.spaTreatmentSkill.deleteMany({ where: { storeId, treatmentId } });
  await tx.spaTreatmentSkill.create({
    data: { storeId, treatmentId, skillId: id },
  });
  await tx.spaStaffSkill.deleteMany({ where: { storeId, skillId: id } });
  await tx.spaStaffSkill.createMany({
    data: [...new Set(staffIds)].map((staffId) => ({
      storeId,
      staffId,
      skillId: id,
    })),
  });
}
function refresh() {
  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/spa-staff");
  revalidatePath("/dashboard/spa-schedule");
}
export async function saveSpaServiceProviders(input: {
  treatmentId: string;
  staffIds: string[];
}) {
  try {
    const storeId = await spaResourceStore("wallet.create");
    const d = z
      .object({
        treatmentId: z.string().min(1),
        staffIds: z.array(z.string()).max(200),
      })
      .parse(input);
    await spaPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      if (
        !(await tx.spaTreatment.findFirst({
          where: { id: d.treatmentId, storeId },
        }))
      )
        throw new AppError("FORBIDDEN", "找不到本店服務");
      const ids = [...new Set(d.staffIds)];
      if (
        (await prisma.staff.count({
          where: { storeId, id: { in: ids }, status: "ACTIVE" },
        })) !== ids.length
      )
        throw new AppError("VALIDATION", "請選擇本店啟用人員");
      await setProviders(tx, storeId, d.treatmentId, ids);
    });
    refresh();
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
export async function saveSpaPersonServices(input: {
  staffId: string;
  treatmentIds: string[];
}) {
  try {
    const storeId = await spaResourceStore("duty.manage");
    const d = z
      .object({
        staffId: z.string().min(1),
        treatmentIds: z.array(z.string()).max(500),
      })
      .parse(input);
    if (
      !(await prisma.staff.findFirst({
        where: { id: d.staffId, storeId, status: "ACTIVE" },
      }))
    )
      throw new AppError("FORBIDDEN", "找不到本店人員");
    await spaPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      const [services, links, people] = await Promise.all([
        tx.spaTreatment.findMany({
          where: { storeId },
          include: { skills: true },
        }),
        tx.spaStaffSkill.findMany({
          where: { storeId, skill: { isActive: true } },
        }),
        prisma.staff.findMany({
          where: { storeId, status: "ACTIVE" },
          select: { id: true },
        }),
      ]);
      if (d.treatmentIds.some((id) => !services.some((t) => t.id === id)))
        throw new AppError("VALIDATION", "服務不屬於本店");
      for (const t of services) {
        const current = people
          .filter((p) =>
            t.skills.every((s) =>
              links.some((l) => l.staffId === p.id && l.skillId === s.skillId),
            ),
          )
          .map((p) => p.id);
        const wanted = d.treatmentIds.includes(t.id);
        if (current.includes(d.staffId) === wanted) continue;
        await setProviders(
          tx,
          storeId,
          t.id,
          wanted
            ? [...current, d.staffId]
            : current.filter((id) => id !== d.staffId),
        );
      }
    });
    refresh();
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
export async function getSpaAvailableProviders(input: {
  date: string;
  startTime: string;
  treatmentIds: string[];
  bookingId?: string;
}) {
  try {
    const storeId = await spaResourceStore("booking.read");
    const d = z
      .object({
        date: z.string().refine(validSpaDate),
        startTime: z.string(),
        treatmentIds: z.array(z.string()).min(1).max(20),
        bookingId: z.string().optional(),
      })
      .parse(input);
    const treatments = await spaPrisma.spaTreatment.findMany({
      where: { storeId, id: { in: d.treatmentIds }, isActive: true },
      include: { skills: true, serviceLocations: true },
    });
    if (treatments.length !== new Set(d.treatmentIds).size)
      throw new AppError("VALIDATION", "請重新選擇服務");
    const end = spaEndTime(d.startTime, treatments),
      date = parseTaiwanDateToDbDate(d.date);
    const [people, links, regular, exceptions, bookings, locations] =
      await Promise.all([
        prisma.staff.findMany({
          where: { storeId, status: "ACTIVE" },
          select: { id: true, displayName: true },
        }),
        spaPrisma.spaStaffSkill.findMany({
          where: { storeId, skill: { isActive: true } },
        }),
        spaPrisma.spaStaffAvailability.findMany({
          where: { storeId, dayOfWeek: date.getUTCDay() },
        }),
        spaPrisma.spaStaffAvailabilityException.findMany({
          where: { storeId, date },
        }),
        spaPrisma.spaBooking.findMany({
          where: {
            storeId,
            bookingDate: date,
            status: { in: ["PENDING", "CONFIRMED"] },
            ...(d.bookingId ? { id: { not: d.bookingId } } : {}),
          },
          select: {
            serviceStaffId: true,
            serviceLocationId: true,
            startTime: true,
            endTime: true,
          },
        }),
        spaPrisma.spaServiceLocation.findMany({
          where: { storeId, isActive: true },
          select: { id: true, name: true },
        }),
      ]);
    const qualified = people.filter((p) =>
      treatments.every((t) =>
        t.skills.every((s) =>
          links.some((l) => l.staffId === p.id && l.skillId === s.skillId),
        ),
      ),
    );
    const onShift = (id: string, start: string, finish: string) =>
      staffAvailable(
        start,
        finish,
        regular.find((r) => r.staffId === id) ?? null,
        exceptions.filter((e) => e.staffId === id),
      );
    const free = (id: string, start: string, finish: string) =>
      !bookings.some(
        (b) =>
          b.serviceStaffId === id &&
          overlaps(start, finish, b.startTime, b.endTime),
      );
    const applicable = locations.filter((l) =>
      treatments.every((t) =>
        t.serviceLocations.some((link) => link.serviceLocationId === l.id),
      ),
    );
    const freeLocations = (start: string, finish: string) =>
      applicable.filter(
        (l) =>
          !bookings.some(
            (b) =>
              b.serviceLocationId === l.id &&
              overlaps(start, finish, b.startTime, b.endTime),
          ),
      );
    const availableLocations = freeLocations(d.startTime, end);
    const available = availableLocations.length
      ? qualified.filter(
          (p) =>
            onShift(p.id, d.startTime, end) && free(p.id, d.startTime, end),
        )
      : [];
    const reason = available.length
      ? ""
      : !applicable.length
        ? "所選服務尚未設定共同適用的啟用位置。"
        : !qualified.length
          ? "尚未設定可提供全部所選服務的人員，請至方案管理設定。"
          : !availableLocations.length
            ? "適用的服務位置在此時段已滿。"
            : !qualified.some((p) => onShift(p.id, d.startTime, end))
              ? "此時段未排班、正在休息，或剩餘班別不足以完成服務。"
              : "符合資格的人員在此時段已有預約。";
    const setupHref = !applicable.length
      ? "/dashboard/spa-resources"
      : !qualified.length
        ? "/dashboard/plans"
        : !qualified.some((p) => onShift(p.id, d.startTime, end))
          ? "/dashboard/spa-staff"
          : null;
    const setupLabel = !applicable.length
      ? "設定服務位置"
      : !qualified.length
        ? "設定可服務人員"
        : "查看人員班表";
    const suggestions: { startTime: string; endTime: string }[] = [];
    const duration = minutesOf(end) - minutesOf(d.startTime);
    if (!available.length && qualified.length && applicable.length) {
      for (
        let minute = Math.ceil((minutesOf(d.startTime) + 1) / 15) * 15;
        minute + duration <= 1440 && suggestions.length < 4;
        minute += 15
      ) {
        const start = timeOf(minute),
          finish = timeOf(minute + duration);
        if (
          freeLocations(start, finish).length &&
          qualified.some(
            (p) => onShift(p.id, start, finish) && free(p.id, start, finish),
          )
        )
          suggestions.push({ startTime: start, endTime: finish });
      }
    }
    return {
      success: true as const,
      people: available.map((p) => ({ id: p.id, name: p.displayName })),
      reason,
      suggestions,
      locations: availableLocations,
      setupHref,
      setupLabel,
    };
  } catch (e) {
    const result = handleActionError(e);
    return {
      success: false as const,
      error: result.success ? "查詢失敗" : result.error,
    };
  }
}

const serviceDetails = z.object({
  id: z.string().min(1).optional(),
  baseName: z.string().trim().min(1).max(100),
  variantLabel: z.string().trim().max(100),
  price: z.number().int().min(0).max(1000000),
  serviceMinutes: z.number().int().min(1).max(1440),
  bufferMinutes: z.number().int().min(0).max(240),
  isActive: z.boolean(),
  publicVisible: z.boolean(),
  staffIds: z.array(z.string()).max(200),
  locationIds: z.array(z.string()).max(200),
});
export async function saveSpaServiceDetails(
  input: z.infer<typeof serviceDetails>,
) {
  try {
    const storeId = await spaResourceStore("wallet.create");
    const d = serviceDetails.parse(input);
    await spaPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      if (
        d.id &&
        !(await tx.spaTreatment.findFirst({ where: { storeId, id: d.id } }))
      )
        throw new AppError("FORBIDDEN", "找不到本店服務");
      const staffIds = [...new Set(d.staffIds)],
        locationIds = [...new Set(d.locationIds)];
      if (
        (await prisma.staff.count({
          where: { storeId, id: { in: staffIds }, status: "ACTIVE" },
        })) !== staffIds.length
      )
        throw new AppError("VALIDATION", "請選擇本店啟用人員");
      if (
        (await tx.spaServiceLocation.count({
          where: { storeId, id: { in: locationIds } },
        })) !== locationIds.length
      )
        throw new AppError("VALIDATION", "服務位置不屬於本店");
      const data = {
        name: d.baseName,
        variantLabel: d.variantLabel,
        price: d.price,
        serviceMinutes: d.serviceMinutes,
        bufferMinutes: d.bufferMinutes,
        isActive: d.isActive,
        publicVisible: d.publicVisible,
      };
      const service = d.id
        ? await tx.spaTreatment.update({
            where: { id_storeId: { id: d.id, storeId } },
            data,
          })
        : await tx.spaTreatment.create({ data: { storeId, ...data } });
      await setProviders(tx, storeId, service.id, staffIds);
      await tx.spaTreatmentServiceLocation.deleteMany({
        where: { storeId, treatmentId: service.id },
      });
      await tx.spaTreatmentServiceLocation.createMany({
        data: locationIds.map((serviceLocationId) => ({
          storeId,
          treatmentId: service.id,
          serviceLocationId,
        })),
      });
    });
    refresh();
    revalidatePath("/dashboard/spa-resources");
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
