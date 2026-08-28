import { SPA_INDUSTRY_MODULE } from "@/lib/industry-modules";
import { SPA_DEMO_BOOKINGS } from "@/lib/spa-demo-store";

export type SpaScheduleServiceInput = {
  bookingId: string;
  servicePlanName?: string | null;
  walletPlanName?: string | null;
};

/**
 * Presentation bridge for the first SPA Demo iteration.
 *
 * Booking does not yet own duration/composed-service columns, so the seeded
 * allowlist remains authoritative for composed Demo bookings. Ordinary plans
 * fall back to the industry catalog. Unknown future records fail visibly to a
 * conservative 90-minute SPA service instead of borrowing Steamfoot's 60-minute
 * display assumption.
 */
export function resolveSpaScheduleService(input: SpaScheduleServiceInput): {
  name: string;
  durationMinutes: number;
} {
  const fixture = SPA_DEMO_BOOKINGS.find((candidate) => candidate.id === input.bookingId);
  if (fixture) {
    return { name: fixture.service, durationMinutes: fixture.durationMinutes };
  }

  const planName = input.servicePlanName ?? input.walletPlanName ?? null;
  const configured = SPA_INDUSTRY_MODULE.services.find((service) => service.name === planName);
  return {
    name: planName ?? "SPA 服務",
    durationMinutes: configured?.durationMinutes ?? 90,
  };
}

export function resolveSpaProviderBadge(displayName: string): string {
  return displayName.match(/^(\d+)號/)?.[1] ?? "--";
}
