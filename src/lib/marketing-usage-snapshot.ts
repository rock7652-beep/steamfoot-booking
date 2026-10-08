export type MarketingUsageSnapshot = {
  stores: number;
  customers: number;
  completedPeople: number;
  remindersSent: number;
  asOf: string;
};

export const verifiedMarketingUsageSnapshot: MarketingUsageSnapshot = {
  stores: 5,
  customers: 338,
  completedPeople: 1698,
  remindersSent: 641,
  asOf: "2026-10-07",
};
