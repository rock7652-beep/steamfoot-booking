import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getLineBotInfo } from "@/lib/line";

export type TrialNotificationSetup =
  | { status: "linked" }
  | { status: "pending"; url: string }
  | { status: "needs_help" };

const TTL_MS = 24 * 60 * 60 * 1000;
const digest = (token: string) => `trial:${createHash("sha256").update(token).digest("hex")}`;

/** Internal only: called after a successful booking, never from a public action
 * accepting customerCreated/customerId from a caller. Phone matching alone is
 * not authority to issue a binding capability for an existing customer. */
export async function prepareTrialNotificationSetup(input: {
  storeId: string; customerId: string; bookingId: string;
  customerCreated: boolean; linked: boolean;
}): Promise<TrialNotificationSetup> {
  if (input.linked) return { status: "linked" };
  if (!input.customerCreated) return { status: "needs_help" };
  try {
    const bot = await getLineBotInfo(input.storeId);
    if (!bot.ok || !/^@[A-Za-z0-9._-]+$/.test(bot.data.basicId)) return { status: "needs_help" };
    const token = randomBytes(32).toString("hex");
    const issued = await prisma.customer.updateMany({
      where: {
        id: input.customerId, storeId: input.storeId, userId: null,
        lineUserId: null, lineBindingCode: null, mergedIntoCustomerId: null,
        bookings: { some: { id: input.bookingId, storeId: input.storeId, bookingType: "FIRST_TRIAL", bookingStatus: { in: ["PENDING", "CONFIRMED"] } } },
      },
      data: { lineBindingCode: digest(token), lineBindingCodeCreatedAt: new Date() },
    });
    if (issued.count !== 1) return { status: "needs_help" };
    return { status: "pending", url: `https://line.me/R/oaMessage/${encodeURIComponent(bot.data.basicId)}/?${encodeURIComponent(`體驗通知 ${token}`)}` };
  } catch {
    // Reservation already exists. Notification setup must not turn success
    // into a booking failure or expose a capability in error logs.
    return { status: "needs_help" };
  }
}

/** Called only after store-specific webhook signature verification. The first
 * successful claim consumes the token atomically; no login Account is touched. */
export async function claimTrialNotificationSetup(storeId: string, lineUserId: string, token: string, now = new Date()): Promise<"linked" | "invalid" | "conflict" | "unavailable"> {
  if (!/^[a-f0-9]{64}$/.test(token)) return "invalid";
  try {
    const claimed = await prisma.$transaction(async tx => {
      const customer = await tx.customer.findFirst({
        where: { storeId, lineBindingCode: digest(token), lineBindingCodeCreatedAt: { gt: new Date(now.getTime() - TTL_MS), lte: now }, lineUserId: null, userId: null, mergedIntoCustomerId: null },
        select: { id: true },
      });
      if (!customer) return "invalid" as const;
      const owner = await tx.customer.findFirst({ where: { storeId, lineUserId, mergedIntoCustomerId: null }, select: { id: true } });
      if (owner) return "conflict" as const;
      const updated = await tx.customer.updateMany({
        where: { id: customer.id, storeId, lineBindingCode: digest(token), lineUserId: null, userId: null, mergedIntoCustomerId: null },
        data: { lineUserId, lineLinkStatus: "LINKED", lineLinkedAt: now, lineBindingCode: null, lineBindingCodeCreatedAt: null },
      });
      if (updated.count !== 1) return "invalid" as const;
      await tx.booking.updateMany({
        where: { storeId, customerId: customer.id, bookingType: "FIRST_TRIAL", bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED"] }, trialBookingChannel: null },
        data: { trialBookingChannel: "LINE" },
      });
      return "linked" as const;
    });
    return claimed;
  } catch (error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "conflict" : "unavailable";
  }
}
