import { createHash } from "node:crypto";
import type { BookingType } from "@prisma/client";
import { canonicalizeBookingSlotTime } from "@/server/services/booking-slot-lock";

export const BOOKING_SUBMISSION_PAYLOAD_VERSION = 1 as const;

export type BookingWalletSelectionMode = "AUTO_FEFO" | "PREFERRED_WALLET";

export type BookingCreateIntentInput = {
  storeId: string;
  actorUserId: string;
  canonicalCustomerId: string;
  bookingType: BookingType;
  servicePlanId?: string | null;
  treatmentIds?: readonly string[] | null;
  bookingDate: string;
  slotTime: string;
  people?: number;
  notes?: string | null;
  expectedAmount?: number | null;
  assignedStaffId?: string | null;
  skipDutyCheck?: boolean;
  customerPlanWalletId?: string | null;
};

export type CanonicalBookingCreateIntent = {
  version: typeof BOOKING_SUBMISSION_PAYLOAD_VERSION;
  submissionType: "BOOKING_CREATE";
  storeId: string;
  actorUserId: string;
  canonicalCustomerId: string;
  bookingType: BookingType;
  servicePlanId: string | null;
  bookingDate: string;
  slotTime: string;
  people: number;
  notes: string | null;
  expectedAmount: number | null;
  assignedStaffId: string | null;
  skipDutyCheck: boolean;
  makeupPolicy: "AUTO_PRIORITY" | "NONE";
  walletSelectionMode: BookingWalletSelectionMode;
  preferredWalletId: string | null;
  treatmentIds: string[] | null;
};

function normalizeNotes(notes: string | null | undefined): string | null {
  const normalized = notes?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function buildCanonicalBookingCreateIntent(
  input: BookingCreateIntentInput,
): CanonicalBookingCreateIntent {
  const preferredWalletId = input.customerPlanWalletId ?? null;
  const walletSelectionMode: BookingWalletSelectionMode = preferredWalletId
    ? "PREFERRED_WALLET"
    : "AUTO_FEFO";

  return {
    version: BOOKING_SUBMISSION_PAYLOAD_VERSION,
    submissionType: "BOOKING_CREATE",
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    canonicalCustomerId: input.canonicalCustomerId,
    bookingType: input.bookingType,
    servicePlanId: input.servicePlanId ?? null,
    bookingDate: input.bookingDate,
    slotTime: canonicalizeBookingSlotTime(input.slotTime),
    people: input.people ?? 1,
    notes: normalizeNotes(input.notes),
    expectedAmount: input.expectedAmount ?? null,
    assignedStaffId: input.assignedStaffId ?? null,
    skipDutyCheck: input.skipDutyCheck ?? false,
    makeupPolicy:
      input.bookingType === "PACKAGE_SESSION" ? "AUTO_PRIORITY" : "NONE",
    walletSelectionMode,
    preferredWalletId:
      walletSelectionMode === "PREFERRED_WALLET" ? preferredWalletId : null,
    treatmentIds:
      input.treatmentIds && input.treatmentIds.length > 0
        ? [...new Set(input.treatmentIds)].sort()
        : null,
  };
}

/**
 * Serialize the explicitly ordered canonical tuple rather than relying on
 * caller object key order. Execution-only wallet/session/credit choices never
 * enter this tuple.
 */
export function hashCanonicalBookingCreateIntent(
  intent: CanonicalBookingCreateIntent,
): string {
  const orderedTuple: unknown[] = [
    intent.version,
    intent.submissionType,
    intent.storeId,
    intent.actorUserId,
    intent.canonicalCustomerId,
    intent.bookingType,
    intent.servicePlanId,
    intent.bookingDate,
    intent.slotTime,
    intent.people,
    intent.notes,
    intent.expectedAmount,
    intent.assignedStaffId,
    intent.skipDutyCheck,
    intent.makeupPolicy,
    intent.walletSelectionMode,
    intent.preferredWalletId,
  ];
  // Keep the tuple byte-for-byte compatible for all existing Steamfoot
  // booking retries. SPA composition is appended only when explicitly used.
  if (intent.treatmentIds) orderedTuple.push(intent.treatmentIds);
  return createHash("sha256").update(JSON.stringify(orderedTuple)).digest("hex");
}

export function buildBookingCreatePayloadHash(
  input: BookingCreateIntentInput,
): { intent: CanonicalBookingCreateIntent; payloadHash: string } {
  const intent = buildCanonicalBookingCreateIntent(input);
  return { intent, payloadHash: hashCanonicalBookingCreateIntent(intent) };
}

export type BookingRecurringIntentInput = {
  storeId: string;
  actorUserId: string;
  canonicalCustomerId: string;
  servicePlanId: string;
  customerPlanWalletId?: string | null;
  bookingDate: string;
  slotTime: string;
  people: number;
  weeks: number;
  notes?: string | null;
  skipDutyCheck?: boolean;
};

export function buildBookingRecurringPayloadHash(
  input: BookingRecurringIntentInput,
): { payloadHash: string } {
  const tuple = [
    BOOKING_SUBMISSION_PAYLOAD_VERSION,
    "BOOKING_RECURRING",
    input.storeId,
    input.actorUserId,
    input.canonicalCustomerId,
    "PACKAGE_SESSION",
    input.servicePlanId,
    canonicalizeBookingSlotTime(input.slotTime),
    input.bookingDate,
    input.people,
    input.weeks,
    normalizeNotes(input.notes),
    input.skipDutyCheck ?? false,
    input.customerPlanWalletId ? "PREFERRED_WALLET" : "AUTO_FEFO",
    input.customerPlanWalletId ?? null,
    "NO_MAKEUP_CREDITS",
  ];
  return {
    payloadHash: createHash("sha256").update(JSON.stringify(tuple)).digest("hex"),
  };
}
