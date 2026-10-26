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
const LOGIN_PROOF_PREFIX = "verified-trial-login-v1:";
export type TrialLoginProof = { channelId: string; lineUserId: string };
const SUPPORTED_PUBLIC_BOOKING_STORE_SLUGS = new Set([
  "zhubei",
  "hsinchu",
  "taichung",
]);

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
  /** Internal only: issued by the ID-token verification route, never a webhook. */
  verifiedLogin?: TrialLoginProof;
  notificationVerified?: boolean;
  now?: Date;
}): Promise<{ url: string; expiresAt: Date }> {
  const store = await prisma.store.findUnique({
    where: { id: input.storeId },
    select: { slug: true, industryModule:true },
  });
  if (!store || (!SUPPORTED_PUBLIC_BOOKING_STORE_SLUGS.has(store.slug) && store.industryModule!=="BEAUTY")) {
    throw new Error("TRIAL_BOOKING_STORE_NOT_SUPPORTED");
  }

  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("base64url");
  // Bind the version into the token hash. Old deployments reject the 3-part
  // capability, and removing its suffix cannot redeem it after a rollback.
  const tokenSecret = input.verifiedLogin ? `${token}.login1` : token;
  if (input.verifiedLogin && (input.channel !== "LINE" || store.industryModule !== "STEAMFOOT" ||
      !/^\d+$/.test(input.verifiedLogin.channelId) || !/^U[0-9a-f]{32}$/.test(input.verifiedLogin.lineUserId) ||
      input.chatIdentity !== input.verifiedLogin.lineUserId)) throw new Error("TRIAL_LOGIN_PROOF_INVALID");
  const identity = input.verifiedLogin ? LOGIN_PROOF_PREFIX + JSON.stringify({
    ...input.verifiedLogin, notificationVerified: input.notificationVerified === true,
  }) : input.chatIdentity;
  const encrypted = encryptDigitalButlerValue(identity);
  const link = await prisma.trialBookingLink.create({
    data: {
      storeId: input.storeId,
      channel: input.channel,
      identityHash: hashDigitalButlerSensitiveValue(identity),
      identityCiphertext: prismaBytes(encrypted.ciphertext),
      identityIv: prismaBytes(encrypted.iv),
      identityAuthTag: prismaBytes(encrypted.authTag),
      identityKeyVersion: encrypted.keyVersion,
      tokenHash: hashToken(tokenSecret),
      expiresAt: new Date(now.getTime() + LINK_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });
  const url = new URL(store.industryModule==="BEAUTY"?`/beauty-trial/${store.slug}`:`/pricing/experience/${store.slug}/book`, deriveBaseUrl());
  url.searchParams.set("entry", `${link.id}.${tokenSecret}`);
  return { url: url.toString(), expiresAt: link.expiresAt };
}

export type TrialBookingChatLinkContext = {
  linkId: string;
  storeId: string;
  channel: TrialBookingChannel;
  chatIdentity: string;
  verifiedLogin?: TrialLoginProof;
  notificationVerified?: boolean;
};

/** Resolves without consuming; booking creation consumes it atomically. */
export async function resolveTrialBookingChatLink(
  token: string,
  now = new Date(),
): Promise<TrialBookingChatLinkContext | null> {
  const parts = token.split(".");
  if (parts.length !== 2 && !(parts.length === 3 && parts[2] === "login1")) return null;
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
  const received = Buffer.from(hashToken(parts.slice(1).join(".")), "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const identity = decryptDigitalButlerValue({
      ciphertext: Buffer.from(link.identityCiphertext), iv: Buffer.from(link.identityIv),
      authTag: Buffer.from(link.identityAuthTag), keyVersion: link.identityKeyVersion as "v1",
    });
    let proof: TrialLoginProof | undefined;
    let notificationVerified: boolean | undefined;
    if (identity.startsWith(LOGIN_PROOF_PREFIX)) {
      if (parts.length !== 3) return null;
      const payload = JSON.parse(identity.slice(LOGIN_PROOF_PREFIX.length));
      if (link.channel !== "LINE" || typeof payload.channelId !== "string" || !/^\d+$/.test(payload.channelId) ||
          typeof payload.lineUserId !== "string" || !/^U[0-9a-f]{32}$/.test(payload.lineUserId) || typeof payload.notificationVerified !== "boolean") return null;
      proof = { channelId: payload.channelId, lineUserId: payload.lineUserId };
      notificationVerified = payload.notificationVerified;
    }
    if (parts.length === 3 && !proof) return null;
    return {
      linkId: link.id,
      storeId: link.storeId,
      channel: link.channel,
      chatIdentity: proof?.lineUserId ?? identity,
      ...(proof ? { verifiedLogin: proof, notificationVerified } : {}),
    };
  } catch {
    return null;
  }
}

export { LINK_TTL_MS };
