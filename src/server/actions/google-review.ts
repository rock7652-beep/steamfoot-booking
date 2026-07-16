"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { deriveBaseUrl } from "@/lib/base-url";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { buildGoogleReviewMessage, googleReviewUrlSchema } from "@/lib/google-review";
import { requirePermission } from "@/lib/permissions";
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
    if (!user.storeId) throw new AppError("FORBIDDEN", "使用者未綁定店別");
    await requireStoreFeature(user.storeId, FEATURES.GOOGLE_REVIEW);

    const cleaned = reviewUrl?.trim() || null;
    const googleReviewUrl = cleaned ? googleReviewUrlSchema.parse(cleaned) : null;
    await prisma.store.update({
      where: { id: user.storeId },
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
    if (!user.storeId) throw new AppError("FORBIDDEN", "使用者未綁定店別");
    await requireStoreFeature(user.storeId, FEATURES.GOOGLE_REVIEW);

    const [customer, store] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: data.customerId, storeId: user.storeId, mergedIntoCustomerId: null },
        select: { id: true },
      }),
      prisma.store.findUnique({
        where: { id: user.storeId },
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
          storeId: user.storeId,
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
            storeId: user.storeId,
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
            storeId: user.storeId,
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
