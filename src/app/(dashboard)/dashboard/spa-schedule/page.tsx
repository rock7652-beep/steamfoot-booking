import { redirect } from "next/navigation";
import { PageShell } from "@/components/desktop";
import { FormSuccessToast } from "@/components/form-success-toast";
import {
  applySlotOverrides,
  loadDayBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import {
  parseLocalDate,
  parseTaiwanDateToDbDate,
  toDateInputValue,
  toLocalDateStr,
} from "@/lib/date-utils";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { calculateSpaProviderStartTimes } from "@/lib/spa-availability";
import { inferSpaDemoResourceType } from "@/lib/spa-demo-catalog";
import { isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { SpaProviderSchedule } from "../bookings/spa-provider-schedule";
import { requireSpaStore } from "@/lib/industry-module-server";
import {
  inferSpaTreatmentKind,
  isSpaSkillKey,
  spaSkillKeyFromId,
} from "@/lib/spa-store-identifiers";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function SpaSchedulePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "booking.read"))
  ) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(activeStoreId, storeViewContext);
  if (!storeId) redirect("/dashboard/bookings");
  await requireSpaStore(storeId).catch(() => redirect("/dashboard/bookings"));

  const params = await searchParams;
  const selectedDate = normalizeRequestedDate(params.date, toLocalDateStr());
  const [year, month] = selectedDate.split("-").map(Number);
  const spaSchemaReady = await isSpaOperationalSchemaReady();
  const isViewMode = storeViewContext?.isViewMode === true;

  const dayOfWeek = parseLocalDate(selectedDate).getDay();
  const [
    monthData,
    staff,
    staffSkills,
    weeklyAvailabilities,
    availabilityExceptions,
    spaTreatments,
  ] = await Promise.all([
    getMonthBookingSummary(year, month, storeId),
    prisma.staff.findMany({
      where: {
        storeId,
        status: "ACTIVE",
        isOwner: false,
      },
      select: { id: true, displayName: true, colorCode: true },
      orderBy: { displayName: "asc" },
    }),
    spaSchemaReady
      ? spaPrisma.spaStaffSkill.findMany({
          where: { storeId },
          select: { staffId: true, skillId: true },
        })
      : Promise.resolve([]),
    spaSchemaReady
      ? spaPrisma.spaStaffAvailability.findMany({
          where: { storeId, dayOfWeek, isActive: true },
          select: { staffId: true, startTime: true, endTime: true },
        })
      : Promise.resolve([]),
    spaSchemaReady
      ? spaPrisma.spaStaffAvailabilityException.findMany({
          where: { storeId, date: parseTaiwanDateToDbDate(selectedDate) },
          select: { staffId: true, type: true, startTime: true, endTime: true },
        })
      : Promise.resolve([]),
    spaSchemaReady
      ? spaPrisma.spaTreatment.findMany({
          where: { storeId, isActive: true },
          select: {
            id: true,
            name: true,
            variantLabel: true,
            price: true,
            serviceMinutes: true,
            bufferMinutes: true,
            skills: { select: { skill: { select: { id: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);
  const spaProviders = staff.map((provider) => ({
    ...provider,
    skills: staffSkills
      .filter((skill) => skill.staffId === provider.id)
      .map((skill) => ({ skill: { id: skill.skillId } })),
    weeklyAvailabilities: weeklyAvailabilities
      .filter((range) => range.staffId === provider.id)
      .map(({ startTime, endTime }) => ({ startTime, endTime })),
    availabilityExceptions: availabilityExceptions
      .filter((exception) => exception.staffId === provider.id)
      .map(({ type, startTime, endTime }) => ({ type, startTime, endTime })),
  }));

  const selectedDay = monthData.find((day) => day.date === selectedDate);
  const spaDayContext = await loadDayBusinessHoursContext(
    storeId,
    selectedDate,
  );
  const bookableStartTimes = applySlotOverrides(
    spaDayContext.rule,
    spaDayContext.slotOverrides,
  )
    .filter((slot) => slot.isEnabled)
    .map((slot) => slot.startTime);
  const occupiedBookings = spaSchemaReady
    ? await spaPrisma.spaBooking.findMany({
        where: {
          storeId,
          bookingDate: parseTaiwanDateToDbDate(selectedDate),
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: {
          id: true,
          startTime: true,
          serviceStaffId: true,
          items: { select: { serviceMinutes: true, bufferMinutes: true } },
        },
      })
    : [];

  const availabilityTreatments = spaTreatments.length
    ? spaTreatments.map((treatment) => ({
        serviceMinutes: treatment.serviceMinutes,
        bufferMinutes: treatment.bufferMinutes,
        skillKeys: treatment.skills
          .map(({ skill }) => spaSkillKeyFromId(skill.id))
          .filter(isSpaSkillKey),
      }))
    : [
        { serviceMinutes: 60, bufferMinutes: 15, skillKeys: ["body"] },
        { serviceMinutes: 30, bufferMinutes: 10, skillKeys: ["head"] },
        { serviceMinutes: 30, bufferMinutes: 10, skillKeys: ["foot"] },
        { serviceMinutes: 60, bufferMinutes: 15, skillKeys: ["face"] },
      ];
  const providerBookableStartTimes = Object.fromEntries(
    spaProviders.map((provider) => {
      const providerSkills = provider.skills.length
        ? provider.skills
            .map(({ skill }) => spaSkillKeyFromId(skill.id))
            .filter(isSpaSkillKey)
        : [];
      const occupiedRanges = occupiedBookings
        .filter((booking) => booking.serviceStaffId === provider.id)
        .map((booking) => ({
          startTime: booking.startTime,
          durationMinutes: booking.items.reduce(
            (sum, item) => sum + item.serviceMinutes + item.bufferMinutes,
            0,
          ),
        }));
      const union = new Set<string>();
      for (const treatment of availabilityTreatments) {
        for (const time of calculateSpaProviderStartTimes({
          candidateStartTimes: bookableStartTimes,
          businessCloseTime: spaDayContext.rule.closeTime ?? "21:00",
          serviceMinutes: treatment.serviceMinutes,
          bufferMinutes: treatment.bufferMinutes,
          requiredSkillKeys: treatment.skillKeys,
          providerSkillKeys: providerSkills,
          weeklyRanges: provider.weeklyAvailabilities.length
            ? provider.weeklyAvailabilities
            : [{ startTime: "10:00", endTime: "21:00" }],
          exceptions: provider.availabilityExceptions,
          occupiedRanges,
        })) {
          union.add(time);
        }
      }
      return [provider.id, [...union].sort()];
    }),
  );

  return (
    <PageShell className="w-full max-w-none px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
      <FormSuccessToast />
      <SpaProviderSchedule
        key={`${selectedDate}-${selectedDay?.bookings.map((booking) => `${booking.id}:${booking.bookingStatus}:${booking.collected}`).join("|") ?? "empty"}`}
        date={selectedDate}
        providers={spaProviders.map((provider) => ({
          ...provider,
          colorCode: provider.colorCode ?? "#8fa89b",
          shiftLabel: provider.weeklyAvailabilities.length
            ? provider.weeklyAvailabilities
                .map((range) => `${range.startTime}–${range.endTime}`)
                .join("、")
            : "今日休假",
          nextAvailableTime:
            providerBookableStartTimes[provider.id]?.[0] ?? null,
        }))}
        bookableStartTimes={bookableStartTimes}
        providerBookableStartTimes={providerBookableStartTimes}
        timeUnitMinutes={spaDayContext.rule.slotInterval === 15 ? 15 : 30}
        treatments={spaTreatments.map((item) => ({
          id: item.id,
          name: item.name,
          variant: item.variantLabel ?? `${item.serviceMinutes} 分鐘`,
          price: Number(item.price),
          serviceMinutes: item.serviceMinutes,
          bufferMinutes: item.bufferMinutes,
          kind: inferSpaTreatmentKind(item.name),
          resourceType: inferSpaDemoResourceType({
            treatmentId: item.id,
            treatmentName: item.name,
          }),
        }))}
        initialBookings={selectedDay?.bookings ?? []}
        readOnly={isViewMode}
      />
    </PageShell>
  );
}

function normalizeRequestedDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = parseLocalDate(value);
  return toDateInputValue(parsed) === value ? value : fallback;
}
