import type { Prisma } from "../../generated/course-client";
import { musicOpeningDateIssue, musicOpeningOperationIssue, readMusicOpeningCard, type OpeningCard } from "./music-opening-runtime";

/** Null is not an expiry policy. Only a verified, matching opening snapshot may
 * authorize it; missing native dates and damaged imported state fail closed. */
export function courseCardHasVerifiedNoExpiry(card: OpeningCard, storeId: string): boolean {
  if (card.expiresAt !== null) return false;
  const state = readMusicOpeningCard(card, storeId);
  return state.kind === "OPENING" && state.record.expiryVerification?.kind === "NO_EXPIRY"
    && musicOpeningOperationIssue(state, card) === null;
}

export function courseCardCoversDate(card: OpeningCard, storeId: string, at: Date): boolean {
  if (!Number.isFinite(at.getTime())) return false;
  const state = readMusicOpeningCard(card, storeId);
  if (musicOpeningOperationIssue(state, card)) return false;
  if (musicOpeningDateIssue(state, at)) return false;
  return card.expiresAt instanceof Date ? card.expiresAt >= at : courseCardHasVerifiedNoExpiry(card, storeId);
}

/** Candidate filter only: materialized rows must still pass the hashed snapshot
 * projection before availability or mutations. Native finite-date behavior stays
 * unchanged. Null candidates require explicit source proof, never raw blanks. */
export function courseCardActiveExpiryWhere(now: Date, inclusive = false): Prisma.CoursePointCardWhereInput {
  return { OR: [
    { expiresAt: inclusive ? { gte: now } : { gt: now } },
    { expiresAt: null, musicOpeningStateRequired: true,
      musicOpeningState: { is: { snapshot: { path: ["record", "expiryVerification", "kind"], equals: "NO_EXPIRY" } } } },
  ] };
}
