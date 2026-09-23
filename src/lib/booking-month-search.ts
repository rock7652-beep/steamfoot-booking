import { normalizeCustomerSearch } from "./customer-search-index";

type SearchableBooking = {
  bookingStatus: string;
  customer: { name: string; phone: string; assignedStaff?: { displayName: string } | null } | null;
  revenueStaff?: { displayName: string } | null;
  serviceStaff?: { displayName: string } | null;
  servicePlan: { name: string } | null;
};

export function matchesBookingSearch(booking: SearchableBooking, filters: {
  status: string; staffName: string; servicePlanId: string; search: string;
}, plans: Array<{ id: string; name: string }>) {
  if (booking.bookingStatus === "CANCELLED") return false;
  if (filters.status && booking.bookingStatus !== filters.status) return false;
  const staff = booking.revenueStaff?.displayName ?? booking.serviceStaff?.displayName ?? booking.customer?.assignedStaff?.displayName ?? "";
  if (filters.staffName && staff !== filters.staffName) return false;
  if (filters.servicePlanId) {
    const plan = plans.find((p) => p.id === filters.servicePlanId);
    if (!plan || booking.servicePlan?.name !== plan.name) return false;
  }
  const query = normalizeCustomerSearch(filters.search);
  if (!query) return true;
  const phone = query.replace(/[\s()+-]/g, "");
  return normalizeCustomerSearch(booking.customer?.name ?? "").includes(query) ||
    Boolean(phone && normalizeCustomerSearch(booking.customer?.phone ?? "").replace(/[\s()+-]/g, "").includes(phone));
}
