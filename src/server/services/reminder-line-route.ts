import type { CentralLineRecipientResolution } from "@/server/services/central-line-recipient";

export type ReminderLineRoute =
  | {
      status: "READY";
      channel: "STORE";
      recipientLineUserId: string;
    }
  | {
      status: "READY";
      channel: "CENTRAL";
      recipientLineUserId: string;
    }
  | {
      status: "BLOCKED";
      channel: null;
      recipientLineUserId: null;
      reason: string;
    };

/**
 * Select exactly one compatible Messaging API channel and recipient.
 *
 * A LINE userId is channel/provider scoped. A store-channel id must therefore
 * be sent with that store's token, while a central LINE Login id must be sent
 * with the SteamButler central token.
 */
export function resolveReminderLineRoute(
  legacyStoreLineUserId: string | null,
  centralRecipient: CentralLineRecipientResolution | null | undefined,
): ReminderLineRoute {
  // A verified central identity is the canonical route. The historical
  // store-scoped recipient remains a compatibility fallback only while the
  // customer has not completed central LINE binding.
  if (centralRecipient?.deliverable && centralRecipient.recipientLineUserId) {
    return {
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: centralRecipient.recipientLineUserId,
    };
  }

  const legacyRecipient = legacyStoreLineUserId?.trim();
  if (legacyRecipient) {
    return {
      status: "READY",
      channel: "STORE",
      recipientLineUserId: legacyRecipient,
    };
  }

  return {
    status: "BLOCKED",
    channel: null,
    recipientLineUserId: null,
    reason: centralRecipient?.status ?? "CUSTOMER_NOT_FOUND",
  };
}
