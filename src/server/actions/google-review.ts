"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deriveBaseUrl } from "@/lib/base-url";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { pushMessage, pushSteamButlerMessage, type LineMessage } from "@/lib/line";
import { buildGoogleReviewMessage, googleReviewUrlSchema } from "@/lib/google-review";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { resolveCentralLineRecipientForCustomer } from "@/server/services/central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";
import type { ActionResult } from "@/types";

type GoogleReviewInviteResult = {
  inviteId: string;
  trackingUrl: string;
  message: string;
  invitedAt: Date;
};

const createGoogleReviewInviteSchema = z.object({
  customerId: z.string().min(1),
  bookingId: z.string().min(1).nullable().optional(),
  source: z.enum(["BOOKING", "CUSTOMER"]),
});

export async function updateGoogleReviewUrl(
  reviewUrl: string | null,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("plans.edit");
    const storeId = await resolveWriteStoreId(user);

    const cleaned = reviewUrl?.trim() || null;
    const googleReviewUrl = cleaned ? googleReviewUrlSchema.parse(cleaned) : null;
    await prisma.store.update({
      where: { id: storeId },
      data: { googleReviewUrl },
    });
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createGoogleReviewInvite(input: {
  customerId: string;
  bookingId?: string | null;
  source: "BOOKING" | "CUSTOMER";
}): Promise<ActionResult<GoogleReviewInviteResult>> {
  try {
    const data = createGoogleReviewInviteSchema.parse(input);
    const user = await requirePermission("customer.update");
    const storeId = await resolveWriteStoreId(user);

    const [customer, store] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: data.customerId, storeId, mergedIntoCustomerId: null },
        select: { id: true },
      }),
      prisma.store.findUnique({
        where: { id: storeId },
        select: {
          slug: true,
          name: true,
          googleReviewUrl: true,
          shopConfig: { select: { shopName: true } },
        },
      }),
    ]);
    if (!customer) throw new AppError("NOT_FOUND", "找不到該店顧客");
    if (!store) throw new AppError("NOT_FOUND", "找不到店別");
    if (!store.googleReviewUrl) throw new AppError("VALIDATION", "請先設定 Google 評論網址");
    googleReviewUrlSchema.parse(store.googleReviewUrl);

    if (data.source === "BOOKING" && !data.bookingId) {
      throw new AppError("VALIDATION", "從預約邀請時必須提供預約");
    }
    if (data.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: {
          id: data.bookingId,
          storeId,
          customerId: data.customerId,
          bookingStatus: "COMPLETED",
        },
        select: { id: true },
      });
      if (!booking) throw new AppError("VALIDATION", "只能邀請該店已完成預約的顧客");
    }

    const invite = data.bookingId
      ? await prisma.googleReviewInvite.upsert({
          where: { bookingId: data.bookingId },
          create: {
            token: randomUUID(),
            storeId,
            customerId: data.customerId,
            bookingId: data.bookingId,
            staffId: user.staffId,
            source: data.source,
          },
          update: {},
        })
      : await prisma.googleReviewInvite.create({
          data: {
            token: randomUUID(),
            storeId,
            customerId: data.customerId,
            staffId: user.staffId,
            source: data.source,
          },
        });

    const trackingUrl = `${deriveBaseUrl()}/s/${encodeURIComponent(store.slug)}/google-review?i=${encodeURIComponent(invite.token)}`;
    return {
      success: true,
      data: {
        inviteId: invite.id,
        trackingUrl,
        message: buildGoogleReviewMessage(store.shopConfig?.shopName || store.name, trackingUrl),
        invitedAt: invite.invitedAt,
      },
    };
  } catch (error) {
    return handleActionError(error);
  }
}

function buildGoogleReviewLineMessage(
  customerName: string,
  shopName: string,
  trackingUrl: string,
): LineMessage[] {
  return [{
    type: "flex",
    altText: `${shopName} 邀請您分享本次體驗`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${customerName} 您好`, weight: "bold", size: "lg" },
          {
            type: "text",
            text: `謝謝您今天來到${shopName} ❤️\n如果今天的體驗讓您感到滿意，歡迎花一分鐘留下真實感受。`,
            wrap: true,
            color: "#554B45",
            size: "sm",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "button",
          style: "primary",
          color: "#9B7355",
          action: { type: "uri", label: "留下 Google 評論", uri: trackingUrl },
        }],
      },
    },
  }];
}

export async function sendGoogleReviewInvite(
  bookingId: string,
): Promise<ActionResult<{ alreadySent: boolean; sentAt: Date }>> {
  try {
    const user = await requirePermission("customer.update");
    const storeId = await resolveWriteStoreId(user);

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        storeId,
        bookingStatus: "COMPLETED",
      },
      select: {
        id: true,
        customerId: true,
        storeId: true,
        customer: {
          select: { name: true, lineUserId: true, lineLinkStatus: true },
        },
        store: {
          select: {
            slug: true,
            name: true,
            googleReviewUrl: true,
            shopConfig: { select: { shopName: true } },
          },
        },
        googleReviewInvite: {
          select: { id: true, token: true, sentAt: true, deliveryStatus: true },
        },
      },
    });
    if (!booking) throw new AppError("VALIDATION", "只能邀請已完成服務的顧客");
    if (!booking.store.googleReviewUrl) {
      throw new AppError("VALIDATION", "請先設定此分店的 Google 評論網址");
    }
    googleReviewUrlSchema.parse(booking.store.googleReviewUrl);

    if (booking.googleReviewInvite?.sentAt) {
      return {
        success: true,
        data: { alreadySent: true, sentAt: booking.googleReviewInvite.sentAt },
      };
    }

    const recipient = await resolveCentralLineRecipientForCustomer(
      booking.customerId,
      booking.storeId,
    );
    const route = await resolveVerifiedReminderLineRoute(
      booking.storeId,
      booking.customer.lineLinkStatus === "LINKED"
        ? booking.customer.lineUserId
        : null,
      recipient,
    );
    if (route.status === "BLOCKED") {
      throw new AppError("BUSINESS_RULE", "此顧客目前無法透過 LINE 接收邀請");
    }

    const invite = booking.googleReviewInvite ?? await prisma.googleReviewInvite.create({
      data: {
        token: randomUUID(),
        storeId: booking.storeId,
        customerId: booking.customerId,
        bookingId: booking.id,
        staffId: user.staffId,
        source: "BOOKING",
      },
      select: { id: true, token: true, sentAt: true, deliveryStatus: true },
    });

    const claimed = await prisma.googleReviewInvite.updateMany({
      where: {
        id: invite.id,
        sentAt: null,
        deliveryStatus: { in: ["READY", "FAILED"] },
      },
      data: { deliveryStatus: "SENDING", lastAttemptAt: new Date(), deliveryError: null },
    });
    if (claimed.count === 0) {
      throw new AppError("CONFLICT", "評論邀請正在傳送，請稍後再確認");
    }

    const shopName = booking.store.shopConfig?.shopName || booking.store.name;
    const trackingUrl = `${deriveBaseUrl()}/s/${encodeURIComponent(booking.store.slug)}/google-review?i=${encodeURIComponent(invite.token)}`;
    const messages = buildGoogleReviewLineMessage(
      booking.customer.name,
      shopName,
      trackingUrl,
    );
    const result = route.channel === "STORE"
      ? await pushMessage(booking.storeId, route.recipientLineUserId, messages)
      : await pushSteamButlerMessage(route.recipientLineUserId, messages);

    if (!result.success) {
      await prisma.googleReviewInvite.update({
        where: { id: invite.id },
        data: { deliveryStatus: "FAILED", deliveryError: result.error ?? "LINE 發送失敗" },
      });
      throw new AppError("BUSINESS_RULE", "LINE 發送失敗，請稍後再試");
    }

    const sentAt = new Date();
    await prisma.$transaction([
      prisma.googleReviewInvite.update({
        where: { id: invite.id },
        data: { sentAt, deliveryStatus: "SENT", deliveryError: null },
      }),
      prisma.messageLog.create({
        data: {
          customerId: booking.customerId,
          storeId: booking.storeId,
          channel: "LINE",
          status: "SENT",
          renderedBody: buildGoogleReviewMessage(shopName, trackingUrl),
          sentAt,
        },
      }),
    ]);
    revalidatePath("/dashboard/bookings");
    return { success: true, data: { alreadySent: false, sentAt } };
  } catch (error) {
    return handleActionError(error);
  }
}
