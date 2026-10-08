import { assertMusicOpeningRuntimeIsolation } from "@/lib/music-opening-preview-isolation";
import { isGuideUiPreview, createGuideUiDisabledClient } from "../../scripts/guide-ui-preview-scope.mjs";
import "server-only";
import { PrismaClient } from "../../generated/course-client";
import { withAuditDatabaseContext } from "@/lib/audit-db-context";
import { guardedSportsSharedCardPreviewClient } from "@/lib/sports-shared-card-preview";

assertMusicOpeningRuntimeIsolation();

const globalForCourse = globalThis as unknown as {
  coursePrisma?: PrismaClient;
};
function databaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return "";
  const url = new URL(base);
  if (!url.searchParams.has("connection_limit"))
    url.searchParams.set("connection_limit", process.env.VERCEL ? "1" : "5");
  if (!url.searchParams.has("pool_timeout"))
    url.searchParams.set("pool_timeout", "10");
  return url.toString();
}
export const coursePrisma: PrismaClient = isGuideUiPreview()
  ? createGuideUiDisabledClient() as PrismaClient
  : guardedSportsSharedCardPreviewClient(
  () => globalForCourse.coursePrisma,
  () => withAuditDatabaseContext(new PrismaClient({
    datasources: { db: { url: databaseUrl() } },
    log: ["error"],
  })),
);
if (!isGuideUiPreview() && process.env.NODE_ENV !== "production")
  globalForCourse.coursePrisma = coursePrisma;
