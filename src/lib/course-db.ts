import { loadCoursePrismaRuntime } from "./generated-prisma-runtime";
import {buildDatabaseUrl} from "./database-url";
import { assertStoreMemberWorkorderReviewOnly } from "../../scripts/store-member-workorder-review-gate.mjs";
assertStoreMemberWorkorderReviewOnly();
import { withMusicRetirement } from "@/lib/music-retirement";
import { assertMusicOpeningRuntimeIsolation, withMusicOpeningRuntimeSchema } from "@/lib/music-opening-preview-isolation";
import { isGuideUiPreview, createGuideUiDisabledClient } from "../../scripts/guide-ui-preview-scope.mjs";
import "server-only";
import type { PrismaClient } from "../../generated/course-client";
import { withAuditDatabaseContext } from "@/lib/audit-db-context";
import { guardedSportsSharedCardPreviewClient } from "@/lib/sports-shared-card-preview";

const { PrismaClient: RuntimePrismaClient, Prisma } = loadCoursePrismaRuntime();
assertMusicOpeningRuntimeIsolation();
const globalForCourse = globalThis as unknown as {
  coursePrisma?: PrismaClient;
};
export const coursePrisma: PrismaClient = isGuideUiPreview()
  ? createGuideUiDisabledClient() as PrismaClient
  : guardedSportsSharedCardPreviewClient(
  () => globalForCourse.coursePrisma,
  () => withAuditDatabaseContext(withMusicRetirement(withMusicOpeningRuntimeSchema(new RuntimePrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log: ["error"],
  })), Prisma.dmmf.datamodel.models)),
);
if (!isGuideUiPreview() && process.env.NODE_ENV !== "production")
  globalForCourse.coursePrisma = coursePrisma;
