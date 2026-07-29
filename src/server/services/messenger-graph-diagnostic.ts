import "server-only";

import { prisma } from "@/lib/db";

const EXPECTED_PAGE_ID = "536890669508668";

type SafeGraphError = {
  type?: string;
  code?: number;
  subcode?: number;
  fbtraceId?: string;
  messageSummary?: string;
};

export type SafeGraphCall = {
  ok: boolean;
  httpStatus: number | null;
  error: SafeGraphError | null;
  identity?: "expected_page" | "different_object" | "not_available";
};

export type MessengerGraphClassification =
  | "TOKEN_INVALID_OR_EXPIRED"
  | "MISSING_PERMISSION"
  | "WRONG_PAGE_OR_NON_PAGE_TOKEN"
  | "APP_PAGE_RELATIONSHIP_OR_ACCESS"
  | "UNSUPPORTED_ENDPOINT"
  | "UNDETERMINED_GRAPH_ERROR"
  | "NO_GRAPH_ERROR";

export type MessengerGraphDiagnosticResult = {
  classification: MessengerGraphClassification;
  findings: MessengerGraphClassification[];
  calls: {
    app: SafeGraphCall;
    me: SafeGraphCall;
    page: SafeGraphCall;
    pageWithFields: SafeGraphCall;
    subscribedApps: SafeGraphCall;
  };
};

function graphVersion(): string {
  return process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0";
}

function redactMessage(value: unknown, token: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const summary = value
    .replaceAll(token, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\bEA[A-Za-z0-9._-]+\b/g, "[token]")
    .replace(/\b\d{8,}\b/g, "[id]")
    .slice(0, 180);
  return summary || undefined;
}

function graphError(raw: unknown, token: string): SafeGraphError | null {
  const error = raw && typeof raw === "object" && !Array.isArray(raw) && "error" in raw
    && raw.error && typeof raw.error === "object" && !Array.isArray(raw.error)
    ? raw.error as Record<string, unknown>
    : null;
  if (!error) return null;
  return {
    ...(typeof error.type === "string" ? { type: error.type } : {}),
    ...(typeof error.code === "number" ? { code: error.code } : {}),
    ...(typeof error.error_subcode === "number" ? { subcode: error.error_subcode } : {}),
    ...(typeof error.fbtrace_id === "string" ? { fbtraceId: error.fbtrace_id } : {}),
    ...(redactMessage(error.message, token) ? { messageSummary: redactMessage(error.message, token) } : {}),
  };
}

async function readGraph(path: string, token: string, expectedPageIdentity = false): Promise<SafeGraphCall> {
  try {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion())}${path}${separator}access_token=${encodeURIComponent(token)}`, { method: "GET", cache: "no-store" });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, httpStatus: response.status, error: graphError(raw, token) };
    const id = raw && typeof raw === "object" && !Array.isArray(raw) && "id" in raw && typeof raw.id === "string" ? raw.id : null;
    return { ok: true, httpStatus: response.status, error: null, ...(expectedPageIdentity ? { identity: id === EXPECTED_PAGE_ID ? "expected_page" : "different_object" } : {}) };
  } catch {
    return { ok: false, httpStatus: null, error: { type: "network_error" } };
  }
}

function containsPermissionEvidence(call: SafeGraphCall): boolean {
  return call.error?.code === 10 || call.error?.code === 200 || /pages_read_engagement|permission/i.test(call.error?.messageSummary ?? "");
}

function isUnsupportedEndpoint(call: SafeGraphCall): boolean {
  return call.error?.code === 100 && /unsupported get request|unsupported endpoint/i.test(call.error?.messageSummary ?? "");
}

function classify(calls: MessengerGraphDiagnosticResult["calls"]): Pick<MessengerGraphDiagnosticResult, "classification" | "findings"> {
  const all = Object.values(calls);
  const findings: MessengerGraphClassification[] = [];
  if (all.some((call) => call.error?.code === 190)) findings.push("TOKEN_INVALID_OR_EXPIRED");
  if (all.some(containsPermissionEvidence)) findings.push("MISSING_PERMISSION");
  if (calls.me.identity === "different_object" || calls.page.identity === "different_object" || calls.pageWithFields.identity === "different_object") findings.push("WRONG_PAGE_OR_NON_PAGE_TOKEN");
  if (calls.subscribedApps.httpStatus === 403 && calls.me.identity === "expected_page" && calls.page.identity === "expected_page") findings.push("APP_PAGE_RELATIONSHIP_OR_ACCESS");
  if (all.some(isUnsupportedEndpoint)) findings.push("UNSUPPORTED_ENDPOINT");
  if (findings.length === 0 && all.some((call) => !call.ok)) findings.push("UNDETERMINED_GRAPH_ERROR");
  if (findings.length === 0) findings.push("NO_GRAPH_ERROR");
  return { classification: findings[0], findings };
}

/** Runs GET-only calls using runtime secrets and persists only de-identified results. */
export async function diagnoseMessengerGraph(input: { actorUserId: string; storeId: string }): Promise<MessengerGraphDiagnosticResult> {
  const appToken = process.env.MESSENGER_APP_ACCESS_TOKEN;
  const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN_ZHUBEI;
  if (!appToken || !pageToken) throw new Error("messenger_graph_diagnostic_configuration_missing");

  const [app, me, page, pageWithFields, subscribedApps] = await Promise.all([
    readGraph("/app", appToken),
    readGraph("/me", pageToken, true),
    readGraph(`/${EXPECTED_PAGE_ID}`, pageToken, true),
    readGraph(`/${EXPECTED_PAGE_ID}?fields=id,name`, pageToken, true),
    readGraph(`/${EXPECTED_PAGE_ID}/subscribed_apps`, pageToken),
  ]);
  const calls = { app, me, page, pageWithFields, subscribedApps };
  const result: MessengerGraphDiagnosticResult = { ...classify(calls), calls };

  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      targetType: "MessengerPage",
      targetId: input.storeId,
      action: "MESSENGER_GRAPH_READONLY_DIAGNOSED",
      afterJson: result,
    },
  });
  return result;
}
