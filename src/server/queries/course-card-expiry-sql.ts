import "server-only";
import { Prisma } from "@prisma/client";
import { coursePrisma } from "@/lib/course-db";
import { courseCardCoversDate, courseCardHasVerifiedNoExpiry } from "@/lib/course-card-expiry";
import { MUSIC_OPENING_CARD_SELECT, readMusicOpeningCard, type OpeningCard } from "@/lib/music-opening-runtime";

/** Exact proof, not only IDs: a concurrent snapshot/card/member change must not
 * turn an earlier successful projection into a live usable balance. */
export function courseNoExpiryProofs(cards: OpeningCard[], storeId: string, now: Date) {
  return cards.flatMap(card => {
    if (!courseCardHasVerifiedNoExpiry(card, storeId) || !courseCardCoversDate(card, storeId, now)) return [];
    const state = readMusicOpeningCard(card, storeId);
    if (state.kind !== "OPENING") return [];
    const row = card.musicOpeningState as { sourceKey: string; contentHash: string; snapshot: unknown; appliedBatchId: string };
    return [{ id: card.id!, storeId, activatedAt: card.musicActivatedAt!.toISOString(), customerId: state.customerId,
      sourceKey: row.sourceKey, contentHash: row.contentHash, snapshot: row.snapshot, appliedBatchId: row.appliedBatchId }];
  });
}
export async function readCourseNoExpiryProofs(storeId: string, now: Date) {
  const candidates = await coursePrisma.coursePointCard.findMany({
    where: { storeId, expiresAt: null, closedAt: null, musicOpeningStateRequired: true },
    select: MUSIC_OPENING_CARD_SELECT,
  });
  return courseNoExpiryProofs(candidates, storeId, now);
}

/** Fixed alias c. Filter before SQL aggregation/pagination, but only after a full
 * hashed projection. Every proof is compared to current persisted values. */
export function courseCardActiveExpirySql(now: Date, inclusive = false, proofs: ReturnType<typeof courseNoExpiryProofs> = []) {
  const finite = inclusive ? Prisma.sql`c."expiresAt">=${now}` : Prisma.sql`c."expiresAt">${now}`;
  if (!proofs.length) return finite;
  return Prisma.sql`(${finite} OR (c."expiresAt" IS NULL AND c."musicOpeningStateRequired"
    AND c.unit='SESSION' AND c."musicValidityDays" IS NULL
    AND EXISTS(SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(proofs)}::jsonb)
      verified(id text,"storeId" text,"activatedAt" timestamptz,"customerId" text,"sourceKey" text,"contentHash" text,snapshot jsonb,"appliedBatchId" text)
      JOIN "CourseMusicOpeningState" expiry_source ON expiry_source."cardId"=verified.id
        AND expiry_source."storeId"=verified."storeId" AND expiry_source."customerId"=verified."customerId"
        AND expiry_source."sourceKey"=verified."sourceKey" AND expiry_source."contentHash"=verified."contentHash"
        AND expiry_source.snapshot=verified.snapshot AND expiry_source."appliedBatchId"=verified."appliedBatchId"
      WHERE verified.id=c.id AND verified."storeId"=c."storeId" AND c."musicActivatedAt"=verified."activatedAt"
        AND EXISTS(SELECT 1 FROM "CourseCardMember" member WHERE member."cardId"=c.id AND member."storeId"=c."storeId" AND member."customerId"=verified."customerId")
        AND NOT EXISTS(SELECT 1 FROM "CourseCardMember" other WHERE other."cardId"=c.id AND (other."storeId"<>c."storeId" OR other."customerId"<>verified."customerId")))))`;
}
