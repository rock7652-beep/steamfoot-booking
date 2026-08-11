import { prisma } from "@/lib/db";
import { createHash } from "node:crypto";

export const MESSENGER_CONFIG_NOT_FOUND = "Messenger page configuration not found";

function envSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function nonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export type MessengerAppAccessTokenInfo = {
  source: "derived_from_app_secret" | "configured_fallback";
  fingerprint: string;
  tokenLength: number;
  hasAppIdPrefix: boolean;
  hasSingleDelimiter: boolean;
  hasWrappingQuotes: boolean;
  hasNewline: boolean;
  trimChangesLength: boolean;
};

type MessengerAppAccessTokenResolution = MessengerAppAccessTokenInfo & { token: string };

function shortFingerprint(value: string): string {
  // Node's built-in crypto is server-only here: this module is never imported
  // into a client component, and only returns a non-reversible prefix.
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

export function getMessengerVerifyToken(): string | null {
  return nonEmptyEnv("MESSENGER_VERIFY_TOKEN");
}

export function getMessengerAppSecret(): string | null {
  return nonEmptyEnv("MESSENGER_APP_SECRET");
}

/**
 * Meta's standard App Access Token is APP_ID|APP_SECRET. Prefer deriving it
 * from the shared server-only app credentials so a copied legacy value cannot
 * drift or become invalid. The configured token remains a compatibility
 * fallback only for environments that intentionally do not hold App Secret.
 */
function resolveMessengerAppAccessToken(): MessengerAppAccessTokenResolution | null {
  const rawAppId = process.env.MESSENGER_APP_ID;
  const rawAppSecret = process.env.MESSENGER_APP_SECRET;
  const rawConfigured = process.env.MESSENGER_APP_ACCESS_TOKEN;
  const appId = rawAppId?.trim();
  const appSecret = rawAppSecret?.trim();
  const configured = rawConfigured?.trim();
  const token = appId && appSecret ? `${appId}|${appSecret}` : configured;
  if (!token) return null;
  const raw = appId && appSecret ? token : rawConfigured ?? token;
  return {
    token,
    source: appId && appSecret ? "derived_from_app_secret" : "configured_fallback",
    fingerprint: shortFingerprint(token),
    tokenLength: token.length,
    hasAppIdPrefix: Boolean(appId && token.startsWith(`${appId}|`)),
    hasSingleDelimiter: token.split("|").length === 2,
    hasWrappingQuotes: (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")),
    hasNewline: /[\r\n]/.test(raw),
    trimChangesLength: raw.length !== raw.trim().length,
  };
}

export function getMessengerAppAccessToken(): string | null {
  return resolveMessengerAppAccessToken()?.token ?? null;
}

/** Safe diagnostics only; the resolved credential is deliberately omitted. */
export function getMessengerAppAccessTokenInfo(): MessengerAppAccessTokenInfo | null {
  const resolution = resolveMessengerAppAccessToken();
  if (!resolution) return null;
  const { token: _token, ...safe } = resolution;
  return safe;
}

export function getMessengerPageConfig(storeSlug: string): {
  pageId: string | null;
  accessToken: string | null;
} {
  const suffix = envSlug(storeSlug);
  return {
    pageId: nonEmptyEnv(`MESSENGER_PAGE_ID_${suffix}`),
    accessToken: nonEmptyEnv(`MESSENGER_PAGE_ACCESS_TOKEN_${suffix}`),
  };
}

export async function resolveMessengerStoreByPageId(pageId: string): Promise<{
  id: string;
  slug: string;
  accessToken: string;
} | null> {
  const stores = await prisma.store.findMany({
    where: {
      isDemo: false,
      operatingStatus: { in: ["ACTIVE", "TRIAL"] },
    },
    select: { id: true, slug: true },
  });

  for (const store of stores) {
    const config = getMessengerPageConfig(store.slug);
    if (config.pageId === pageId && config.accessToken) {
      return { id: store.id, slug: store.slug, accessToken: config.accessToken };
    }
  }

  return null;
}
