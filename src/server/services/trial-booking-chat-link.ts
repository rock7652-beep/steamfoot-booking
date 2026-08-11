import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { TrialBookingChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import {
  decryptDigitalButlerValue,
  encryptDigitalButlerValue,
  hashDigitalButlerSensitiveValue,
} from "@/lib/digital-butler-crypto";

const LINK_TTL_MS = 30 * 60 * 1000;
const SUPPORTED_PUBLIC_BOOKING_STORE_SLUG = "zhubei";

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Issues an opaque, one-time booking entry link. Never log the return value. */
export async function createTrialBookingChatLink(input: {
  storeId: string;
  channel: TrialBookingChannel;
  chatIdentity: string;
  now?: Date;
}): Promise<{ url: string; expiresAt: Date }> {
  const store = await prisma.store.findUnique({
    where: { id: input.storeId },
    select: { slug: true },
  });
  if (store?.slug !== SUPPORTED_PUBLIC_BOOKING_STORE_SLUG) {
    throw new Error("TRIAL_BOOKING_STORE_NOT_SUPPORTED");
  }

  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const encrypted = encryptDigitalButlerValue(input.chatIdentity);
  const link = await prisma.trialBookingLink.create({
    data: {
      storeId: input.storeId,
      channel: input.channel,
      identityHash: hashDigitalButlerSensitiveValue(input.chatIdentity),
      identityCiphertext: prismaBytes(encrypted.ciphertext),
      identityIv: prismaBytes(encrypted.iv),
      identityAuthTag: prismaBytes(encrypted.authTag),
      identityKeyVersion: encrypted.keyVersion,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + LINK_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });
  const url = new URL("/pricing/experience/zhubei/book", deriveBaseUrl());
  url.searchParams.set("entry", `${link.id}.${token}`);
  return { url: url.toString(), expiresAt: link.expiresAt };
}

export type TrialBookingChatLinkContext = {
  linkId: string;
  storeId: string;
  channel: TrialBookingChannel;
  chatIdentity: string;
};

/** Resolves without consuming; booking creation consumes it atomically. */
export async function resolveTrialBookingChatLink(
  token: string,
  now = new Date(),
): Promise<TrialBookingChatLinkContext | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [linkId, secret] = parts;
  if (!linkId || !secret) return null;
  const link = await prisma.trialBookingLink.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      storeId: true,
      channel: true,
      tokenHash: true,
      expiresAt: true,
      consumedAt: true,
      identityCiphertext: true,
      identityIv: true,
      identityAuthTag: true,
      identityKeyVersion: true,
    },
  });
  if (!link || link.consumedAt || link.expiresAt <= now) return null;
  const expected = Buffer.from(link.tokenHash, "hex");
  const received = Buffer.from(hashToken(secret), "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    return {
      linkId: link.id,
      storeId: link.storeId,
      channel: link.channel,
      chatIdentity: decryptDigitalButlerValue({
        ciphertext: Buffer.from(link.identityCiphertext),
        iv: Buffer.from(link.identityIv),
        authTag: Buffer.from(link.identityAuthTag),
        keyVersion: link.identityKeyVersion as "v1",
      }),
    };
  } catch {
    return null;
  }
}

export { LINK_TTL_MS };
