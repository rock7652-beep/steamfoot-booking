import { probeStoreLineRecipient } from "@/lib/line";
import {
  resolveReminderLineRoute,
  type ReminderLineRoute,
} from "@/server/services/reminder-line-route";
import type { CentralLineRecipientResolution } from "@/server/services/central-line-recipient";

/**
 * A legacy Customer.lineUserId may have come from central LINE Login rather
 * than the booking store's webhook. Verify it against the store channel before
 * selecting STORE. A definitive mismatch falls back to the verified central
 * recipient; an upstream outage fails closed instead of guessing.
 */
export async function resolveVerifiedReminderLineRoute(
  storeId: string,
  legacyStoreLineUserId: string | null,
  centralRecipient: CentralLineRecipientResolution | null | undefined,
): Promise<ReminderLineRoute> {
  const candidate = legacyStoreLineUserId?.trim();
  if (!candidate) return resolveReminderLineRoute(null, centralRecipient);

  const probe = await probeStoreLineRecipient(storeId, candidate);
  if (probe.status === "COMPATIBLE") {
    return resolveReminderLineRoute(candidate, centralRecipient);
  }
  if (probe.status === "INCOMPATIBLE") {
    return resolveReminderLineRoute(null, centralRecipient);
  }
  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: `store_channel_verification_unavailable:${probe.httpStatus ?? "network"}`,
  };
}
