import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSteamButlerLineSecret } from "@/lib/line-config";

import {
  brandProfileSchema,
  emptyBrandProfile,
  type BrandProfile,
} from "./brand-ai-dialogue";
export type BrandMemory = {
  scopeKey: string;
  sessionId: string;
  revision: number;
  profile: BrandProfile;
};

export function brandMemoryKey(userId: string) {
  const secret = getSteamButlerLineSecret();
  if (!secret) throw Error("BRAND_MEMORY_UNAVAILABLE");
  return createHmac("sha256", secret)
    .update("brand-line-memory-v2\0")
    .update(userId)
    .digest("hex");
}

/** Only a bounded profile is stored, never free text, userId, phone or email. */
export async function loadBrandMemory(
  userId: string,
  database = prisma,
): Promise<BrandMemory> {
  const scopeKey = brandMemoryKey(userId);
  return database.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1600, hashtext(${scopeKey}))`;
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const previous = await tx.brandAiConversation.findUnique({
        where: { scopeKey },
      });
      if (previous && previous.expiresAt > now)
        return {
          ...previous,
          profile: brandProfileSchema.parse(previous.profile),
        };
      // New UUID prevents a late response for an expired session reviving it.
      const row = await tx.brandAiConversation.upsert({
        where: { scopeKey },
        create: {
          scopeKey,
          sessionId: randomUUID(),
          profile: emptyBrandProfile,
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
        update: {
          sessionId: randomUUID(),
          profile: emptyBrandProfile,
          revision: 0,
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
      });
      return { ...row, profile: brandProfileSchema.parse(row.profile) };
    },
    { maxWait: 2000, timeout: 5000 },
  );
}

export async function brandMemoryCurrent(
  memory: BrandMemory,
  database = prisma,
) {
  const [row] = await database.$queryRaw<
    { valid: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM "BrandAiConversation"
    WHERE "scopeKey"=${memory.scopeKey} AND "sessionId"=${memory.sessionId}::uuid
    AND revision=${memory.revision} AND "expiresAt">clock_timestamp()) AS valid`;
  return row.valid;
}

export async function saveBrandMemory(
  memory: BrandMemory,
  profile: BrandProfile,
  database = prisma,
) {
  const safeProfile = brandProfileSchema.parse(profile);
  return database.$transaction(
    async (tx) => {
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const result = await tx.brandAiConversation.updateMany({
        where: {
          scopeKey: memory.scopeKey,
          sessionId: memory.sessionId,
          revision: memory.revision,
          expiresAt: { gt: now },
        },
        data: { profile: safeProfile, revision: { increment: 1 } },
      });
      return result.count === 1;
    },
    { maxWait: 2000, timeout: 5000 },
  );
}

export async function purgeExpiredBrandMemory(database = prisma) {
  // DB time, bounded batch; the scheduled job also runs while the AI is off.
  return database.$executeRaw`DELETE FROM "BrandAiConversation" WHERE "scopeKey" IN
    (SELECT "scopeKey" FROM "BrandAiConversation" WHERE "expiresAt" <= clock_timestamp() ORDER BY "expiresAt" LIMIT 1000) AND "expiresAt" <= clock_timestamp()`;
}
