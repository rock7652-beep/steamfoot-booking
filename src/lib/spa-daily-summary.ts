import type { SpaDemoBooking, SpaDemoProvider } from "@/lib/spa-demo-store";

export type SpaDailyPaymentMethod = "現金" | "刷卡" | "儲值金" | "扣療程" | "未記錄";

export type SpaDailyGroup = {
  key: string;
  bookingIds: readonly string[];
  customer: string;
  time: string;
  people: number;
  completedCount: number;
  expectedAmount: number;
  paidAmount: number;
  refundAmount: number;
  checkoutMode: "整組付款" | "分開付款" | "單人付款" | "待結帳";
  paymentSummary: string;
};

export type SpaDailyProviderPerformance = {
  providerId: string;
  label: string;
  completedServices: number;
  serviceAmount: number;
  refundAmount: number;
  netServiceAmount: number;
};

export type SpaDailySummary = {
  bookingCount: number;
  completedCount: number;
  pendingCount: number;
  expectedAmount: number;
  paidAmount: number;
  grossPaidAmount: number;
  refundAmount: number;
  unsettledGroupCount: number;
  unrecordedPaymentCount: number;
  reconciliationStatus: "EMPTY" | "PENDING" | "READY";
  groups: readonly SpaDailyGroup[];
  payments: readonly {
    method: SpaDailyPaymentMethod;
    count: number;
    amount: number;
    grossAmount: number;
  }[];
  providerPerformance: readonly SpaDailyProviderPerformance[];
};

const PAYMENT_METHODS: readonly SpaDailyPaymentMethod[] = ["現金", "刷卡", "儲值金", "扣療程", "未記錄"];

function paymentMethod(label?: string | null): SpaDailyPaymentMethod {
  if (!label) return "未記錄";
  if (label.startsWith("現金")) return "現金";
  if (label.startsWith("刷卡")) return "刷卡";
  if (label.startsWith("儲值金")) return "儲值金";
  if (label.startsWith("扣療程")) return "扣療程";
  return "未記錄";
}

function groupKey(booking: SpaDemoBooking): string {
  if ((booking.partySize ?? 1) <= 1) return booking.id;
  return `${booking.date}|${booking.time}|${booking.customer}|${booking.partySize}`;
}

function isGroupCheckout(bookings: readonly SpaDemoBooking[], expectedAmount: number): boolean {
  if (bookings.length <= 1 || bookings.some((booking) => booking.status !== "已完成")) return false;
  if (bookings.every((booking) => booking.settlementScope === "GROUP")) return true;
  const first = bookings[0];
  const sameSettlement = bookings.every((booking) => booking.settlementLabel === first.settlementLabel);
  const recordedAmount = first.settlementAmount ?? 0;
  const packageGroup = first.settlementLabel === `扣療程 ${bookings.length} 次`;
  return sameSettlement && (recordedAmount === expectedAmount || packageGroup);
}

function groupPaymentEntries(bookings: readonly SpaDemoBooking[], groupCheckout: boolean) {
  const completed = bookings.filter((booking) => booking.status === "已完成");
  if (!completed.length) return [];
  if (groupCheckout) {
    const booking = completed[0];
    const refunds = completed.reduce((total, item) => total + (item.refundAmount ?? 0), 0);
    const grossAmount = booking.settlementAmount ?? 0;
    return [{ method: paymentMethod(booking.settlementLabel), amount: Math.max(grossAmount - refunds, 0), grossAmount }];
  }
  return completed.map((booking) => ({
    method: paymentMethod(booking.settlementLabel),
    amount: Math.max((booking.settlementAmount ?? 0) - (booking.refundAmount ?? 0), 0),
    grossAmount: booking.settlementAmount ?? 0,
  }));
}

export function buildSpaDailySummary(
  bookings: readonly SpaDemoBooking[],
  providers: readonly SpaDemoProvider[],
): SpaDailySummary {
  const grouped = new Map<string, SpaDemoBooking[]>();
  for (const booking of bookings) {
    const key = groupKey(booking);
    grouped.set(key, [...(grouped.get(key) ?? []), booking]);
  }

  const paymentEntries: { method: SpaDailyPaymentMethod; amount: number; grossAmount: number }[] = [];
  const groups = [...grouped.entries()]
    .map(([key, groupBookings]) => {
      const ordered = groupBookings.toSorted((left, right) => (left.guestIndex ?? 1) - (right.guestIndex ?? 1));
      const expectedAmount = ordered.reduce((total, booking) => total + (booking.price ?? 0), 0);
      const completedCount = ordered.filter((booking) => booking.status === "已完成").length;
      const groupCheckout = isGroupCheckout(ordered, expectedAmount);
      const entries = groupPaymentEntries(ordered, groupCheckout);
      const refundAmount = ordered.reduce((total, booking) => total + (booking.refundAmount ?? 0), 0);
      paymentEntries.push(...entries);
      const checkoutMode = completedCount < ordered.length
        ? "待結帳" as const
        : ordered.length === 1
          ? "單人付款" as const
          : groupCheckout
            ? "整組付款" as const
            : "分開付款" as const;
      const paymentSummary = entries.length
        ? `${[...new Set(entries.map((entry) => entry.method))].join("＋")}${refundAmount > 0 || ordered.some((booking) => booking.refundedAt) ? "・含退款" : ""}`
        : "尚未結帳";
      return {
        key,
        bookingIds: ordered.map((booking) => booking.id),
        customer: ordered[0]?.customer ?? "顧客",
        time: ordered[0]?.time ?? "",
        people: ordered.length,
        completedCount,
        expectedAmount,
        paidAmount: entries.reduce((total, entry) => total + entry.amount, 0),
        refundAmount,
        checkoutMode,
        paymentSummary,
      };
    })
    .toSorted((left, right) => left.time.localeCompare(right.time));

  const payments = PAYMENT_METHODS
    .map((method) => {
      const matching = paymentEntries.filter((entry) => entry.method === method);
      return {
        method,
        count: matching.length,
        amount: matching.reduce((total, entry) => total + entry.amount, 0),
        grossAmount: matching.reduce((total, entry) => total + entry.grossAmount, 0),
      };
    })
    .filter((entry) => entry.count > 0);

  const providerPerformance = providers
    .map((provider) => {
      const completed = bookings.filter((booking) => booking.providerId === provider.id && booking.status === "已完成");
      const refundAmount = completed.reduce((total, booking) => total + (booking.refundedAt ? (booking.price ?? 0) : 0), 0);
      const serviceAmount = completed.reduce((total, booking) => total + (booking.price ?? 0), 0);
      return {
        providerId: provider.id,
        label: `${provider.badge}號 ${provider.name}`,
        completedServices: completed.length,
        serviceAmount,
        refundAmount,
        netServiceAmount: Math.max(serviceAmount - refundAmount, 0),
      };
    })
    .filter((provider) => provider.completedServices > 0);

  const completedCount = bookings.filter((booking) => booking.status === "已完成").length;
  const expectedAmount = groups.reduce((total, group) => total + group.expectedAmount, 0);
  const refundAmount = groups.reduce((total, group) => total + group.refundAmount, 0);
  const paidAmount = paymentEntries.reduce((total, entry) => total + entry.amount, 0);
  const unsettledGroupCount = groups.filter((group) => group.checkoutMode === "待結帳").length;
  const unrecordedPaymentCount = groups.filter((group) => (
    group.completedCount === group.people && group.paymentSummary.includes("未記錄")
  )).length;
  const reconciliationStatus = bookings.length === 0
    ? "EMPTY" as const
    : unsettledGroupCount > 0 || unrecordedPaymentCount > 0
      ? "PENDING" as const
      : "READY" as const;
  return {
    bookingCount: bookings.length,
    completedCount,
    pendingCount: bookings.length - completedCount,
    expectedAmount,
    paidAmount,
    grossPaidAmount: paidAmount + refundAmount,
    refundAmount,
    unsettledGroupCount,
    unrecordedPaymentCount,
    reconciliationStatus,
    groups,
    payments,
    providerPerformance,
  };
}
