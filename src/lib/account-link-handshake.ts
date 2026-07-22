export const ACCOUNT_LINK_COOKIE = "customer-account-link";
export const ACCOUNT_LINK_TTL_SECONDS = 5 * 60;

export type LinkableOAuthProvider = "google" | "line";
export type AccountLinkIntent = "link" | "replace";

type AccountLinkPayload = {
  userId: string;
  provider: LinkableOAuthProvider;
  intent: AccountLinkIntent;
  nonce: string;
  expiresAt: number;
};

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

function encode(value: string | ArrayBuffer): string {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

async function sign(value: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("Account link handshake secret is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export async function issueAccountLinkHandshake(input: {
  userId: string;
  provider: LinkableOAuthProvider;
  intent?: AccountLinkIntent;
}): Promise<string> {
  const payload: AccountLinkPayload = {
    userId: input.userId,
    provider: input.provider,
    intent: input.intent ?? "link",
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + ACCOUNT_LINK_TTL_SECONDS * 1000,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded)}`;
}

export async function verifyAccountLinkHandshake(
  token: string | null | undefined,
  provider: string,
): Promise<AccountLinkPayload | null> {
  if (!token || (provider !== "google" && provider !== "line")) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = await sign(encoded);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(decode(encoded)) as Partial<AccountLinkPayload>;
    if (
      typeof payload.userId !== "string" ||
      payload.userId.length === 0 ||
      payload.provider !== provider ||
      (payload.intent !== "link" && payload.intent !== "replace") ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length === 0 ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload as AccountLinkPayload;
  } catch {
    return null;
  }
}
