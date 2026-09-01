import "server-only";

import { PrismaClient } from "@/generated/spa-client";
import { buildDatabaseUrl } from "@/lib/database-url";

const globalForSpaPrisma = globalThis as unknown as {
  spaPrisma: PrismaClient | undefined;
};

/**
 * SPA business data client. This client cannot address Steamfoot Booking,
 * Transaction, CustomerPlanWallet, or WalletSession models by construction.
 */
export const spaPrisma = globalForSpaPrisma.spaPrisma ?? new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForSpaPrisma.spaPrisma = spaPrisma;
