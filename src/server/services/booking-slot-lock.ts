import { Prisma } from "@prisma/client";

const CANONICAL_SLOT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LEGACY_SLOT_TIME_WITH_SECONDS = /^([01]\d|2[0-3]):([0-5]\d):00$/;

export type BookingSlotLockKey = {
  storeId: string;
  bookingDate: string;
  slotTime: string;
};

/**
 * Normalize the persisted/accepted slot formats to the identity used by locks.
 * New writes are HH:mm. HH:mm:00 is accepted only so legacy rows, if any,
 * contend with the same lock instead of creating a parallel capacity bucket.
 */
export function canonicalizeBookingSlotTime(slotTime: string): string {
  if (CANONICAL_SLOT_TIME.test(slotTime)) return slotTime;
  const legacy = LEGACY_SLOT_TIME_WITH_SECONDS.exec(slotTime);
  if (legacy) return `${legacy[1]}:${legacy[2]}`;
  throw new Error(`Invalid booking slot time: ${slotTime}`);
}

export function bookingSlotTimeVariants(slotTime: string): string[] {
  const canonical = canonicalizeBookingSlotTime(slotTime);
  return [canonical, `${canonical}:00`];
}

function canonicalLockIdentity(key: BookingSlotLockKey): string {
  const slotTime = canonicalizeBookingSlotTime(key.slotTime);
  return `${key.storeId}\u001f${key.bookingDate}\u001f${slotTime}`;
}

/**
 * Serialize all capacity-changing writes for a store/date/slot inside the
 * caller's transaction. Identities are de-duplicated and sorted before locks
 * are acquired so multi-slot operations cannot invert lock order.
 */
export async function acquireBookingSlotLocks(
  tx: Prisma.TransactionClient,
  keys: BookingSlotLockKey[],
): Promise<void> {
  const identities = [...new Set(keys.map(canonicalLockIdentity))].sort();
  for (const identity of identities) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))
    `;
  }
}
