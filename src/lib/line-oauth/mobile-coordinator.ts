import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

const STATE_PREFIX = "wm1";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";
const CHANNEL_KEY = "web-mobile";

type MobileLineProfile = { userId: string; displayName?: string };

type StatePayload = {
  v: 1;
  attemptId: string;
  storeId: string;
  storeSlug: string;
  returnPath: string;
  nonce: string;
  exp: number;
};

export class MobileLineOAuthError extends Error {}

function contextSecret(): string {
  const value = process.env.LINE_OAUTH_STORE_CONTEXT_SECRET;
  if (!value) throw new MobileLineOAuthError("LINE OAuth store context is unavailable");
  return value;
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.WEB_LINE_LOGIN_CHANNEL_ID?.trim();
  const clientSecret = process.env.WEB_LINE_LOGIN_CHANNEL_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new MobileLineOAuthError("Web LINE Login is not configured");
  }
  return { clientId, clientSecret };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function signature(payload: string): string {
  return createHmac("sha256", contextSecret()).update(payload).digest("base64url");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function allowedReturnPath(storeSlug: string, returnPath: string): boolean {
  return returnPath === `/s/${storeSlug}/book` ||
    returnPath === `/s/${storeSlug}/liff/spa-work`;
}

function issueState(payload: StatePayload): string {
  const encoded = encode(payload);
  return `${STATE_PREFIX}.${encoded}.${signature(encoded)}`;
}

export function isMobileCoordinatorState(state: string | null): boolean {
  return typeof state === "string" && state.startsWith(`${STATE_PREFIX}.`);
}

export function verifyMobileCoordinatorState(rawState: string): StatePayload {
  const [prefix, encoded, suppliedSignature, ...rest] = rawState.split(".");
  if (prefix !== STATE_PREFIX || !encoded || !suppliedSignature || rest.length) {
    throw new MobileLineOAuthError("Invalid LINE OAuth state");
  }
  if (!constantTimeEquals(signature(encoded), suppliedSignature)) {
    throw new MobileLineOAuthError("Invalid LINE OAuth state");
  }
  const parsed = decode(encoded);
  if (
    !parsed || typeof parsed !== "object" ||
    (parsed as StatePayload).v !== 1 ||
    typeof (parsed as StatePayload).attemptId !== "string" ||
    typeof (parsed as StatePayload).storeId !== "string" ||
    typeof (parsed as StatePayload).storeSlug !== "string" ||
    typeof (parsed as StatePayload).returnPath !== "string" ||
    typeof (parsed as StatePayload).nonce !== "string" ||
    typeof (parsed as StatePayload).exp !== "number"
  ) {
    throw new MobileLineOAuthError("Invalid LINE OAuth state");
  }
  const payload = parsed as StatePayload;
  if (!allowedReturnPath(payload.storeSlug, payload.returnPath)) {
    throw new MobileLineOAuthError("Invalid LINE OAuth return path");
  }
  return payload;
}

export async function createMobileAuthorization(input: {
  callbackUrl: string;
  storeSlug: string;
  returnPath: string;
}): Promise<string> {
  if (!allowedReturnPath(input.storeSlug, input.returnPath)) {
    throw new MobileLineOAuthError("Invalid LINE OAuth return path");
  }
  const store = await prisma.store.findUnique({
    where: { slug: input.storeSlug },
    select: { id: true, slug: true },
  });
  if (!store || store.slug !== input.storeSlug) {
    throw new MobileLineOAuthError("LINE OAuth store is unavailable");
  }
  const { clientId } = credentials();
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);
  const attempt = await prisma.lineOAuthAttempt.create({
    data: {
      storeId: store.id,
      storeSlug: store.slug,
      channelKey: CHANNEL_KEY,
      stateHash: randomBytes(32).toString("hex"),
      nonceHash: sha256(nonce),
      expiresAt,
    },
    select: { id: true },
  });
  const state = issueState({
    v: 1,
    attemptId: attempt.id,
    storeId: store.id,
    storeSlug: store.slug,
    returnPath: input.returnPath,
    nonce,
    exp: expiresAt.getTime(),
  });
  await prisma.lineOAuthAttempt.update({
    where: { id: attempt.id },
    data: { stateHash: sha256(state) },
  });

  const url = new URL(LINE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile");
  return url.toString();
}

export async function consumeMobileCallback(input: {
  state: string;
  code: string;
  callbackUrl: string;
}): Promise<{
  profile: MobileLineProfile;
  attemptId: string;
  storeId: string;
  storeSlug: string;
  returnPath: string;
}> {
  const payload = verifyMobileCoordinatorState(input.state);
  if (payload.exp <= Date.now()) throw new MobileLineOAuthError("LINE OAuth state expired");

  const consumed = await prisma.lineOAuthAttempt.updateMany({
    where: {
      id: payload.attemptId,
      storeId: payload.storeId,
      storeSlug: payload.storeSlug,
      channelKey: CHANNEL_KEY,
      stateHash: sha256(input.state),
      nonceHash: sha256(payload.nonce),
      status: "PENDING",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { status: "CONSUMED", consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new MobileLineOAuthError("LINE OAuth state is invalid or already used");
  }

  const { clientId, clientSecret } = credentials();
  const tokenResponse = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.callbackUrl,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  const token = await tokenResponse.json().catch(() => null) as { access_token?: string } | null;
  if (!tokenResponse.ok || !token?.access_token) {
    console.warn("[line-oauth][web-mobile] token exchange failed", {
      attemptId: payload.attemptId,
      storeId: payload.storeId,
      status: tokenResponse.status,
    });
    throw new MobileLineOAuthError("LINE OAuth token exchange failed");
  }

  const profileResponse = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const profile = await profileResponse.json().catch(() => null) as MobileLineProfile | null;
  if (!profileResponse.ok || !profile?.userId) {
    throw new MobileLineOAuthError("LINE OAuth profile lookup failed");
  }
  return {
    profile,
    attemptId: payload.attemptId,
    storeId: payload.storeId,
    storeSlug: payload.storeSlug,
    returnPath: payload.returnPath,
  };
}
