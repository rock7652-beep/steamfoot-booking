import { assertConsultationPreviewEnvironment, isConsultationMockedUnitTest } from "../../scripts/consultation-preview-scope.mjs";

// Validate before build/config work, cached client access, or construction.
// Only nondeployed mocked tests may retain legacy guide/production fixtures.
if (!isConsultationMockedUnitTest(process.env)) {
  assertConsultationPreviewEnvironment(process.env);
}

import { isGuideUiPreview, createGuideUiDisabledClient } from "../../scripts/guide-ui-preview-scope.mjs";
import "server-only";
import { configureSpaPreviewPool } from "./spa-preview-pool";

import { PrismaClient } from "../../generated/spa-client";
import { withAuditDatabaseContext } from "@/lib/audit-db-context";

function buildSpaDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;
  const url = new URL(base);
  configureSpaPreviewPool(url);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", process.env.VERCEL ? "1" : "5");
  }
  if (!url.searchParams.has("pool_timeout"))
    url.searchParams.set("pool_timeout", "10");
  return url.toString();
}

const globalForSpaPrisma = globalThis as unknown as {
  spaPrisma?: PrismaClient;
};

/** Dedicated SPA client: it intentionally cannot address Steamfoot Booking or Transaction. */
export const spaPrisma: PrismaClient = isGuideUiPreview()
  ? createGuideUiDisabledClient() as PrismaClient
  : (isConsultationMockedUnitTest(process.env) ? globalForSpaPrisma.spaPrisma : undefined) ??
  withAuditDatabaseContext(new PrismaClient({
    datasources: { db: { url: buildSpaDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }));

if (!isGuideUiPreview() && (
  process.env.NODE_ENV !== "production" ||
  (process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/hq-module-foundation")
))
  globalForSpaPrisma.spaPrisma = spaPrisma;
