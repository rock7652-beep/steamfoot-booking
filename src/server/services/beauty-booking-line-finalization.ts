import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { beautyPrisma } from "@/lib/beauty-db";
import { resolveTrialBookingChatLink } from "./trial-booking-chat-link";
import { connectVerifiedBeautyBooking } from "@/server/beauty/verified-booking-identity";

/** A confirmed reservation must not become a booking error if identity sync
 * fails. Retries repair only this exact committed command, never reserve again.
 * Beauty keeps its restricted role; primary identity writes use their existing
 * server-only connection and roll back together on any owner conflict. */
export async function finalizeBeautyBookingLine(input: {
  storeId: string; groupId: string; requestKey: string; entryToken?: string;
}): Promise<{ status: "linked" | "needs_help" }> {
  if (!input.entryToken) return { status: "needs_help" };
  try {
    const actorKey = "entry:" + createHash("sha256").update(input.entryToken).digest("hex");
    const command = await beautyPrisma.beautyCommand.findUnique({ where: {
      storeId_requestKey: { storeId: input.storeId, requestKey: input.requestKey },
    }, select: { actorKey: true, result: true } });
    if (!command || command.actorKey !== actorKey || !command.result ||
        typeof command.result !== "object" || Array.isArray(command.result) || command.result.groupId !== input.groupId) return { status: "needs_help" };
    const entry = await resolveTrialBookingChatLink(input.entryToken, new Date(), true);
    if (!entry || entry.storeId !== input.storeId || entry.channel !== "LINE") return { status: "needs_help" };
    const group = await beautyPrisma.beautyGroup.findFirst({
      where: { id: input.groupId, storeId: input.storeId }, select: { customerId: true, contactName: true },
    });
    if (!group?.customerId) return { status: "needs_help" };
    await prisma.$transaction(tx => connectVerifiedBeautyBooking(tx, {
      storeId: input.storeId, customerId: group.customerId!, lineUserId: entry.chatIdentity, name: group.contactName,
    }));
    return { status: "linked" };
  } catch {
    console.warn("[beauty-line-finalization] identity_sync_pending", { storeId: input.storeId });
    return { status: "needs_help" };
  }
}
