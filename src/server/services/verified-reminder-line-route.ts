import {
  probeSteamButlerLineRecipient,
  probeStoreLineRecipient,
} from "@/lib/line";
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
  if (!candidate) return resolveVerifiedCentralReminderLineRoute(centralRecipient);

  const probe = await probeStoreLineRecipient(storeId, candidate);
  if (probe.status === "COMPATIBLE") {
    return resolveReminderLineRoute(candidate, centralRecipient);
  }
  if (probe.status === "INCOMPATIBLE") {
    return resolveVerifiedCentralReminderLineRoute(centralRecipient);
  }
  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: `store_channel_verification_unavailable:${probe.httpStatus ?? "network"}`,
  };
}

/**
 * Account(provider="line") proves LINE Login ownership, not Messaging API
 * reachability. Verify it against the central bot before using it as a push
 * recipient; this prevents a misleading "linked" state from becoming two
 * guaranteed 400 attempts across unrelated LINE providers.
 */
export async function resolveVerifiedCentralReminderLineRoute(
  centralRecipient: CentralLineRecipientResolution | null | undefined,
): Promise<ReminderLineRoute> {
  const candidate = centralRecipient?.deliverable
    ? centralRecipient.recipientLineUserId?.trim()
    : null;
  if (!candidate) return resolveReminderLineRoute(null, centralRecipient);

  const probe = await probeSteamButlerLineRecipient(candidate);
  if (probe.status === "COMPATIBLE") {
    return {
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: candidate,
    };
  }
  if (probe.status === "INCOMPATIBLE") {
    return {
      status: "BLOCKED",
      channel: null,
      recipientLineUserId: null,
      reason: "CENTRAL_LINE_NOT_MESSAGING_REACHABLE",
    };
  }
  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: `central_channel_verification_unavailable:${probe.httpStatus ?? "network"}`,
  };
}
