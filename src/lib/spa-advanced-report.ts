import { buildSpaDailySummary } from "@/lib/spa-daily-summary";
import type { SpaDemoBooking, SpaDemoProvider } from "@/lib/spa-demo-store";

export type SpaAdvancedReport = {
  bookingGroups: number;
  completedServices: number;
  grossReceived: number;
  refundAmount: number;
  netReceived: number;
  averageGroupSpend: number;
  providers: readonly {
    providerId: string;
    label: string;
    completedServices: number;
    refundedServices: number;
    serviceAmount: number;
    netServiceAmount: number;
    compensationLabel: string;
    compensationAmount: number | null;
  }[];
  services: readonly {
    name: string;
    completedCount: number;
    refundedCount: number;
    serviceAmount: number;
  }[];
};

export function buildSpaAdvancedReport(
  bookings: readonly SpaDemoBooking[],
  providers: readonly SpaDemoProvider[],
  dateFrom: string,
  dateTo: string,
): SpaAdvancedReport {
  const inRange = bookings.filter((booking) => booking.date >= dateFrom && booking.date <= dateTo);
  const dates = [...new Set(inRange.map((booking) => booking.date))];
  const daily = dates.map((date) => buildSpaDailySummary(inRange.filter((booking) => booking.date === date), providers));
  const completed = inRange.filter((booking) => booking.status === "已完成");

  const providerRows = providers.flatMap((provider) => {
    const providerBookings = completed.filter((booking) => booking.providerId === provider.id);
    if (!providerBookings.length) return [];
    const activeBookings = providerBookings.filter((booking) => !booking.refundedAt);
    const serviceAmount = providerBookings.reduce((total, booking) => total + (booking.price ?? 0), 0);
    const netServiceAmount = activeBookings.reduce((total, booking) => total + (booking.price ?? 0), 0);
    let compensationAmount: number | null = null;
    let compensationLabel = "尚未設定";
    if (provider.compensationMode === "PERCENTAGE" && provider.compensationValue !== null && provider.compensationValue !== undefined) {
      compensationAmount = Math.round(netServiceAmount * provider.compensationValue / 100);
      compensationLabel = `${provider.compensationValue}%`;
    } else if (provider.compensationMode === "FIXED" && provider.compensationValue !== null && provider.compensationValue !== undefined) {
      compensationAmount = Math.round(activeBookings.length * provider.compensationValue);
      compensationLabel = `每位 NT$${provider.compensationValue.toLocaleString()}`;
    }
    return [{
      providerId: provider.id,
      label: `${provider.badge}號 ${provider.name}`,
      completedServices: providerBookings.length,
      refundedServices: providerBookings.length - activeBookings.length,
      serviceAmount,
      netServiceAmount,
      compensationLabel,
      compensationAmount,
    }];
  });

  const serviceMap = new Map<string, { completedCount: number; refundedCount: number; serviceAmount: number }>();
  for (const booking of completed) {
    for (const service of booking.serviceItems) {
      const current = serviceMap.get(service) ?? { completedCount: 0, refundedCount: 0, serviceAmount: 0 };
      current.completedCount += 1;
      if (booking.refundedAt) current.refundedCount += 1;
      current.serviceAmount += booking.price ?? 0;
      serviceMap.set(service, current);
    }
  }

  const bookingGroups = daily.reduce((total, summary) => total + summary.groups.length, 0);
  const grossReceived = daily.reduce((total, summary) => total + summary.grossPaidAmount, 0);
  const refundAmount = daily.reduce((total, summary) => total + summary.refundAmount, 0);
  const netReceived = grossReceived - refundAmount;
  return {
    bookingGroups,
    completedServices: completed.length,
    grossReceived,
    refundAmount,
    netReceived,
    averageGroupSpend: bookingGroups ? Math.round(netReceived / bookingGroups) : 0,
    providers: providerRows.toSorted((left, right) => right.netServiceAmount - left.netServiceAmount),
    services: [...serviceMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .toSorted((left, right) => right.completedCount - left.completedCount || right.serviceAmount - left.serviceAmount),
  };
}
