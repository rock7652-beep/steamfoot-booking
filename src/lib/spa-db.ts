import "server-only";

import { PrismaClient } from "../../generated/spa-client";

function buildSpaDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;
  const url = new URL(base);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", process.env.VERCEL ? "1" : "5");
  }
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "10");
  return url.toString();
}

const globalForSpaPrisma = globalThis as unknown as { spaPrisma?: PrismaClient };

/** Dedicated SPA client: it intentionally cannot address Steamfoot Booking or Transaction. */
export const spaPrisma = globalForSpaPrisma.spaPrisma ?? new PrismaClient({
  datasources: { db: { url: buildSpaDatabaseUrl() } },
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForSpaPrisma.spaPrisma = spaPrisma;
