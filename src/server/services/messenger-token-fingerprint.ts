import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const EXPECTED_PAGE_ID = "536890669508668";

type TokenFormat = {
  tokenLength: number;
  hasWrappingQuotes: boolean;
  hasNewline: boolean;
  trimChangesLength: boolean;
};

type SafeGraphError = {
  httpStatus: number | null;
  ok: boolean;
  error: {
    type?: string;
    code?: number;
    subcode?: number;
    fbtraceId?: string;
    messageSummary?: string;
  } | null;
};

export type MessengerTokenFingerprintResult = {
  runtime: TokenFormat & { fingerprint: string };
  local: TokenFormat & { fingerprint: string };
  fingerprintsMatch: boolean;
  graphChecks: { me: SafeGraphError; page: SafeGraphError };
};

function fingerprint(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 12);
}

export function getTokenFormat(token: string): TokenFormat {
  const trimmed = token.trim();
  return {
    tokenLength: token.length,
    hasWrappingQuotes: (token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")),
    hasNewline: /[\r\n]/.test(token),
    trimChangesLength: token.length !== trimmed.length,
  };
}

function redactMessage(value: unknown, token: string): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replaceAll(token, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\bEA[A-Za-z0-9._-]+\b/g, "[token]")
    .replace(/\b\d{8,}\b/g, "[id]")
    .slice(0, 180);
}

function safeError(raw: unknown, response: Response, token: string): SafeGraphError {
  const graphError = raw && typeof raw === "object" && !Array.isArray(raw) && "error" in raw
    && raw.error && typeof raw.error === "object" && !Array.isArray(raw.error)
    ? raw.error as Record<string, unknown>
    : null;
  return {
    ok: response.ok,
    httpStatus: response.status,
    error: response.ok ? null : {
      ...(typeof graphError?.type === "string" ? { type: graphError.type } : {}),
      ...(typeof graphError?.code === "number" ? { code: graphError.code } : {}),
      ...(typeof graphError?.error_subcode === "number" ? { subcode: graphError.error_subcode } : {}),
      ...(typeof graphError?.fbtrace_id === "string" ? { fbtraceId: graphError.fbtrace_id } : {}),
      ...(redactMessage(graphError?.message, token) ? { messageSummary: redactMessage(graphError?.message, token) } : {}),
    },
  };
}

async function graphCheck(path: string, token: string): Promise<SafeGraphError> {
  try {
    const version = process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0";
    const params = new URLSearchParams({ fields: "id,name", access_token: token });
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(version)}${path}?${params.toString()}`, { cache: "no-store" });
    const raw: unknown = await response.json().catch(() => null);
    return safeError(raw, response, token);
  } catch {
    return { ok: false, httpStatus: null, error: { type: "network_error" } };
  }
}

/**
 * Compares only a short SHA-256 prefix. The exact local token never crosses
 * the network; callers provide only its browser-computed fingerprint/format.
 */
export async function diagnoseMessengerPageToken(input: { actorUserId: string; storeId: string; localFingerprint: string; localFormat: TokenFormat }): Promise<MessengerTokenFingerprintResult> {
  const runtimeToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI;
  if (!runtimeToken) throw new Error("runtime_token_missing");

  const runtime = { fingerprint: fingerprint(runtimeToken), ...getTokenFormat(runtimeToken) };
  const [me, page] = await Promise.all([
    graphCheck("/me", runtimeToken),
    graphCheck(`/${EXPECTED_PAGE_ID}`, runtimeToken),
  ]);

  const result: MessengerTokenFingerprintResult = {
    runtime,
    local: { fingerprint: input.localFingerprint, ...input.localFormat },
    fingerprintsMatch: runtime.fingerprint === input.localFingerprint,
    graphChecks: { me, page },
  };
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      targetType: "MessengerPage",
      targetId: input.storeId,
      action: "MESSENGER_PAGE_TOKEN_FINGERPRINT_DIAGNOSED",
      afterJson: {
        fingerprintsMatch: result.fingerprintsMatch,
        runtimeFormat: getTokenFormat(runtimeToken),
        localFormat: input.localFormat,
        graphChecks: result.graphChecks,
      },
    },
  });
  return result;
}
