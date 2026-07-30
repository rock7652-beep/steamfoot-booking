import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

const STATE_PREFIX = "tc1";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";

export type TaichungLineProfile = { userId: string; displayName?: string };

type StatePayload = {
  v: 1;
  attemptId: string;
  storeId: string;
  storeSlug: "taichung";
  channelKey: "taichung";
  nonce: string;
  exp: number;
};

export class TaichungOAuthError extends Error {}

function logTokenExchangeFailure(input: {
  status: number;
  response: unknown;
  callbackUrl: string;
}): void {
  const body = input.response && typeof input.response === "object"
    ? input.response as Record<string, unknown>
    : {};
  // This is deliberately an allowlist. Do not add request material, raw OAuth
  // values, or arbitrary response bodies to this diagnostic event.
  console.warn("[line-oauth][taichung] token exchange failed", {
    tokenEndpointStatus: input.status,
    lineError: typeof body.error === "string" ? body.error.slice(0, 200) : null,
    lineErrorDescription: typeof body.error_description === "string"
      ? body.error_description.slice(0, 500)
      : null,
    deploymentEnvironment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    callbackHost: new URL(input.callbackUrl).host,
    channelKey: "taichung",
  });
}

function contextSecret(): string {
  const secret = process.env.LINE_OAUTH_STORE_CONTEXT_SECRET;
  if (!secret) throw new TaichungOAuthError("LINE OAuth store context is unavailable");
  return secret;
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.LINE_TAICHUNG_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_TAICHUNG_LOGIN_CHANNEL_SECRET;
  if (!clientId || !clientSecret) {
    // Deliberately do not fall back to LINE_LOGIN_CHANNEL_*.
    throw new TaichungOAuthError("Taichung LINE Login is not configured");
  }
  return { clientId, clientSecret };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function signature(payload: string): string {
  return createHmac("sha256", contextSecret()).update(payload).digest("base64url");
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

function issueState(payload: StatePayload): string {
  const encoded = encode(payload);
  return `${STATE_PREFIX}.${encoded}.${signature(encoded)}`;
}

export function verifyTaichungState(rawState: string): StatePayload {
  const [prefix, encoded, receivedSignature, ...rest] = rawState.split(".");
  if (prefix !== STATE_PREFIX || !encoded || !receivedSignature || rest.length > 0) {
    throw new TaichungOAuthError("Invalid LINE OAuth state");
  }
  if (!constantTimeEquals(signature(encoded), receivedSignature)) {
    throw new TaichungOAuthError("Invalid LINE OAuth state");
  }
  const parsed = decode(encoded);
  if (
    !parsed || typeof parsed !== "object" ||
    (parsed as StatePayload).v !== 1 ||
    typeof (parsed as StatePayload).attemptId !== "string" ||
    typeof (parsed as StatePayload).storeId !== "string" ||
    (parsed as StatePayload).storeSlug !== "taichung" ||
    (parsed as StatePayload).channelKey !== "taichung" ||
    typeof (parsed as StatePayload).nonce !== "string" ||
    typeof (parsed as StatePayload).exp !== "number"
  ) throw new TaichungOAuthError("Invalid LINE OAuth state");
  return parsed as StatePayload;
}

export async function createTaichungAuthorization(callbackUrl: string): Promise<string> {
  const store = await prisma.store.findUnique({
    where: { slug: "taichung" },
    select: { id: true, slug: true },
  });
  if (!store) throw new TaichungOAuthError("Taichung store is unavailable");
  const { clientId } = credentials();
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);
  const attempt = await prisma.lineOAuthAttempt.create({
    data: {
      storeId: store.id,
      storeSlug: store.slug,
      channelKey: "taichung",
      // Placeholder is replaced with the hash of the final signed state below.
      stateHash: randomBytes(32).toString("hex"),
      nonceHash: sha256(nonce),
      expiresAt,
    },
    select: { id: true },
  });
  const state = issueState({ v: 1, attemptId: attempt.id, storeId: store.id, storeSlug: "taichung", channelKey: "taichung", nonce, exp: expiresAt.getTime() });
  await prisma.lineOAuthAttempt.update({ where: { id: attempt.id }, data: { stateHash: sha256(state) } });

  const url = new URL(LINE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile");
  return url.toString();
}

export async function consumeTaichungCallback(input: {
  state: string;
  code: string;
  callbackUrl: string;
}): Promise<{ profile: TaichungLineProfile; storeId: string; attemptId: string }> {
  const payload = verifyTaichungState(input.state);
  if (payload.exp <= Date.now()) throw new TaichungOAuthError("LINE OAuth state expired");
  const now = new Date();
  const consumed = await prisma.lineOAuthAttempt.updateMany({
    where: {
      id: payload.attemptId,
      storeId: payload.storeId,
      storeSlug: "taichung",
      channelKey: "taichung",
      stateHash: sha256(input.state),
      nonceHash: sha256(payload.nonce),
      status: "PENDING",
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { status: "CONSUMED", consumedAt: now },
  });
  if (consumed.count !== 1) throw new TaichungOAuthError("LINE OAuth state is invalid or already used");

  const { clientId, clientSecret } = credentials();
  const tokenResponse = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.callbackUrl, client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  const token = await tokenResponse.json().catch(() => null) as { access_token?: string } | null;
  if (!tokenResponse.ok || !token?.access_token) {
    logTokenExchangeFailure({ status: tokenResponse.status, response: token, callbackUrl: input.callbackUrl });
    throw new TaichungOAuthError("LINE OAuth token exchange failed");
  }
  const profileResponse = await fetch(LINE_PROFILE_URL, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  const profile = await profileResponse.json().catch(() => null) as TaichungLineProfile | null;
  if (!profileResponse.ok || !profile?.userId) throw new TaichungOAuthError("LINE OAuth profile lookup failed");
  return { profile, storeId: payload.storeId, attemptId: payload.attemptId };
}

export async function resolveTaichungCustomer(storeId: string, lineUserId: string) {
  const link = await prisma.customerIdentityLink.findUnique({
    where: { uq_customer_identity_provider_store: { provider: "line", providerAccountId: lineUserId, storeId } },
    select: { customer: { select: { id: true, userId: true, mergedIntoCustomerId: true } } },
  });
  if (link?.customer && !link.customer.mergedIntoCustomerId) return link.customer;
  return prisma.customer.findFirst({
    where: { storeId, lineUserId, mergedIntoCustomerId: null },
    select: { id: true, userId: true, mergedIntoCustomerId: true },
  });
}

// A confirmed Taiwan flow may have just claimed a safe, inactive placeholder
// through /oauth-confirm.  Activate that exact same Customer and create the
// store-scoped link atomically.  This intentionally does not create or alter
// the legacy global `Account(provider=line)` record.
export async function activateTaichungCustomer(input: {
  storeId: string;
  customerId: string;
  lineUserId: string;
  displayName?: string;
}): Promise<{ id: string; userId: string }> {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, storeId: input.storeId, lineUserId: input.lineUserId, mergedIntoCustomerId: null },
      select: { id: true, userId: true, name: true, phone: true },
    });
    if (!customer) throw new TaichungOAuthError("Taiwan customer context no longer matches");
    const conflictingLink = await tx.customerIdentityLink.findUnique({
      where: { uq_customer_identity_provider_store: { provider: "line", providerAccountId: input.lineUserId, storeId: input.storeId } },
      select: { customerId: true, userId: true },
    });
    if (conflictingLink && conflictingLink.customerId !== customer.id) throw new TaichungOAuthError("LINE identity is linked to another Taiwan customer");

    // Store-scoped identity links are the source of truth for multi-store members.
    // A central User may already belong to another store's Customer, so do not
    // create a duplicate User or force the same User.id into Customer.userId.
    const linkedUserId = conflictingLink?.userId;
    const userId = customer.userId ?? linkedUserId ?? (await tx.user.create({
      data: { name: customer.name || input.displayName || "LINE 用戶", phone: customer.phone, role: "CUSTOMER", status: "ACTIVE" },
      select: { id: true },
    })).id;
    if (!customer.userId && !linkedUserId) {
      const updated = await tx.customer.updateMany({ where: { id: customer.id, userId: null }, data: { userId } });
      if (updated.count !== 1) throw new TaichungOAuthError("Taiwan customer was changed concurrently");
    }
    if (!conflictingLink) {
      await tx.customerIdentityLink.create({ data: { userId, storeId: input.storeId, customerId: customer.id, provider: "line", providerAccountId: input.lineUserId, lineUserId: input.lineUserId } });
    }
    return { id: customer.id, userId };
  });
}

export function isTaichungCoordinatorState(state: string | null): boolean {
  return typeof state === "string" && state.startsWith(`${STATE_PREFIX}.`);
}
