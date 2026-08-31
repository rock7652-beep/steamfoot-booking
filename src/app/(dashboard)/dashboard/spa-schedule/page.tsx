import { redirect } from "next/navigation";
import { PageShell } from "@/components/desktop";
import { FormSuccessToast } from "@/components/form-success-toast";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { prisma } from "@/lib/db";
import {
  parseLocalDate,
  parseTaiwanDateToDbDate,
  toDateInputValue,
  toLocalDateStr,
} from "@/lib/date-utils";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { calculateSpaProviderStartTimes } from "@/lib/spa-availability";
import { SPA_DEMO_CATALOG } from "@/lib/spa-demo-catalog";
import { resolveSpaScheduleService } from "@/lib/spa-dashboard-schedule";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_PROVIDERS,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";
import { isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { SpaProviderSchedule } from "../bookings/spa-provider-schedule";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function SpaSchedulePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(activeStoreId, storeViewContext);
  if (storeId !== SPA_DEMO_STORE.id) redirect("/dashboard/bookings");

  const identity = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, slug: true, isDemo: true },
  });
  assertSpaDemoStoreIdentity(identity);

  const params = await searchParams;
  const selectedDate = normalizeRequestedDate(params.date, toLocalDateStr());
  const [year, month] = selectedDate.split("-").map(Number);
  const spaSchemaReady = await isSpaOperationalSchemaReady();
  const isViewMode = storeViewContext?.isViewMode === true;

  const [monthData, spaProviders, spaTreatments] = await Promise.all([
    getMonthBookingSummary(year, month, SPA_DEMO_STORE.id),
    spaSchemaReady
      ? prisma.staff.findMany({
          where: {
            storeId: SPA_DEMO_STORE.id,
            id: { in: SPA_DEMO_PROVIDERS.map((provider) => provider.id) },
            status: "ACTIVE",
            isOwner: false,
          },
          select: {
            id: true,
            displayName: true,
            colorCode: true,
            skills: { select: { skill: { select: { id: true } } } },
            weeklyAvailabilities: {
              where: {
                dayOfWeek: parseLocalDate(selectedDate).getDay(),
                isActive: true,
              },
              select: { startTime: true, endTime: true },
            },
            availabilityExceptions: {
              where: { date: parseTaiwanDateToDbDate(selectedDate) },
              select: { type: true, startTime: true, endTime: true },
            },
          },
          orderBy: { displayName: "asc" },
        })
      : prisma.staff
          .findMany({
            where: {
              storeId: SPA_DEMO_STORE.id,
              id: { in: SPA_DEMO_PROVIDERS.map((provider) => provider.id) },
              status: "ACTIVE",
              isOwner: false,
            },
            select: { id: true, displayName: true, colorCode: true },
            orderBy: { displayName: "asc" },
          })
          .then((providers) =>
            providers.map((provider) => ({
              ...provider,
              skills: [],
              weeklyAvailabilities: [],
              availabilityExceptions: [],
            })),
          ),
    spaSchemaReady
      ? prisma.treatment.findMany({
          where: { storeId: SPA_DEMO_STORE.id, isActive: true },
          select: {
            serviceMinutes: true,
            bufferMinutes: true,
            skills: { select: { skill: { select: { id: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const selectedDay = monthData.find((day) => day.date === selectedDate);
  const spaDayContext = await loadDayBusinessHoursContext(
    SPA_DEMO_STORE.id,
    selectedDate,
  );
  const bookableStartTimes = applySlotOverrides(
    spaDayContext.rule,
    spaDayContext.slotOverrides,
  )
    .filter((slot) => slot.isEnabled)
    .map((slot) => slot.startTime);
  const occupiedBookings = spaSchemaReady
    ? await prisma.booking.findMany({
        where: {
          storeId: SPA_DEMO_STORE.id,
          bookingDate: parseTaiwanDateToDbDate(selectedDate),
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          serviceStaffId: { not: null },
        },
        select: {
          id: true,
          slotTime: true,
          serviceStaffId: true,
          treatmentServiceMinutesSnapshot: true,
          treatmentBufferMinutesSnapshot: true,
          servicePlan: { select: { name: true } },
        },
      })
    : await prisma.booking
        .findMany({
          where: {
            storeId: SPA_DEMO_STORE.id,
            bookingDate: parseTaiwanDateToDbDate(selectedDate),
            bookingStatus: { in: ["PENDING", "CONFIRMED"] },
            serviceStaffId: { not: null },
          },
          select: {
            id: true,
            slotTime: true,
            serviceStaffId: true,
            servicePlan: { select: { name: true } },
          },
        })
        .then((bookings) =>
          bookings.map((booking) => ({
            ...booking,
            treatmentServiceMinutesSnapshot: null,
            treatmentBufferMinutesSnapshot: null,
          })),
        );

  const availabilityTreatments = spaTreatments.length
    ? spaTreatments.map((treatment) => ({
        serviceMinutes: treatment.serviceMinutes,
        bufferMinutes: treatment.bufferMinutes,
        skillKeys: treatment.skills.map(({ skill }) =>
          skill.id.replace("spa-demo-skill-", ""),
        ),
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
        ? provider.skills.map(({ skill }) =>
            skill.id.replace("spa-demo-skill-", ""),
          )
        : ["body", "head", "foot", "face"];
      const occupiedRanges = occupiedBookings
        .filter((booking) => booking.serviceStaffId === provider.id)
        .map((booking) => ({
          startTime: booking.slotTime,
          durationMinutes:
            (booking.treatmentServiceMinutesSnapshot ??
              resolveSpaScheduleService({
                bookingId: booking.id,
                servicePlanName: booking.servicePlan?.name,
              }).durationMinutes) +
            (booking.treatmentBufferMinutesSnapshot ?? 0),
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
    <PageShell className="flex h-[calc(100dvh-64px)] w-full max-w-none flex-col gap-3 px-4 py-3">
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
          nextAvailableTime: providerBookableStartTimes[provider.id]?.[0] ?? null,
        }))}
        bookableStartTimes={bookableStartTimes}
        providerBookableStartTimes={providerBookableStartTimes}
        timeUnitMinutes={spaDayContext.rule.slotInterval === 15 ? 15 : 30}
        treatments={SPA_DEMO_CATALOG.map((item) => ({ ...item }))}
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
