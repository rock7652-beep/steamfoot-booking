import "server-only";

import { prisma } from "@/lib/db";
import { getMessengerPageConfig } from "@/lib/messenger-config";
import { createMessengerAuditRun, type MessengerAuditSafeResult } from "@/server/services/messenger-production-audit";

const EXPECTED_APP_ID = "1019175470965183";
const EXPECTED_PAGE_ID = "536890669508668";
const REQUIRED_FIELDS = ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"];

type SafeGraphCall = {
  ok: boolean;
  httpStatus: number | null;
  error: "http_error" | "invalid_response" | "network_error" | null;
  graphCode?: number;
  graphSubcode?: number;
  graphType?: string;
};

type RepairFailure = {
  status: "blocked" | "failed";
  code: string;
  classification: "token_invalid_or_expired" | "page_identity_mismatch" | "page_access_forbidden" | "app_mismatch" | "other_graph_error" | "repair_write_failed";
  calls: Record<string, SafeGraphCall>;
};

export type MessengerPageRepairResult = RepairFailure | {
  status: "repaired";
  auditRunId: string;
  audit: Pick<MessengerAuditSafeResult, "appValidated" | "pageTokenMatches" | "callbackMatches" | "configuredFields" | "missingFields" | "pageAttached" | "calls">;
};

function graphVersion(): string {
  return process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0";
}

function safeGraphError(value: unknown): Pick<SafeGraphCall, "graphCode" | "graphSubcode" | "graphType"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const error = "error" in value && value.error && typeof value.error === "object" && !Array.isArray(value.error)
    ? value.error as Record<string, unknown>
    : null;
  if (!error) return {};
  return {
    ...(typeof error.code === "number" ? { graphCode: error.code } : {}),
    ...(typeof error.error_subcode === "number" ? { graphSubcode: error.error_subcode } : {}),
    ...(typeof error.type === "string" ? { graphType: error.type } : {}),
  };
}

async function graphRequest(path: string, accessToken: string, method: "GET" | "POST", params?: Record<string, string>): Promise<{ call: SafeGraphCall; data: Record<string, unknown> | null }> {
  try {
    const query = new URLSearchParams({ ...(params ?? {}), access_token: accessToken });
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion())}${path}?${query.toString()}`, { method, cache: "no-store" });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) return { call: { ok: false, httpStatus: response.status, error: "http_error", ...safeGraphError(raw) }, data: null };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { call: { ok: false, httpStatus: response.status, error: "invalid_response" }, data: null };
    return { call: { ok: true, httpStatus: response.status, error: null }, data: raw as Record<string, unknown> };
  } catch {
    return { call: { ok: false, httpStatus: null, error: "network_error" }, data: null };
  }
}

function classifyTokenFailure(call: SafeGraphCall): RepairFailure["classification"] {
  if (call.graphCode === 190) return "token_invalid_or_expired";
  if (call.httpStatus === 403) return "page_access_forbidden";
  return "other_graph_error";
}

async function record(input: { actorUserId: string; storeId: string; action: string; before?: object; after?: object }) {
  await prisma.auditLog.create({
    data: { actorUserId: input.actorUserId, targetType: "MessengerPage", targetId: input.storeId, action: input.action, beforeJson: input.before, afterJson: input.after },
  });
}

/**
 * Repairs only the Zhubei Page installation after proving the configured Page
 * token resolves to the intended Page. Every persisted value is de-identified.
 */
export async function repairMessengerPageBinding(input: { storeId: string; storeSlug: string; requestedByUserId: string }): Promise<MessengerPageRepairResult> {
  if (input.storeSlug !== "zhubei") {
    return { status: "blocked", code: "STORE_NOT_ELIGIBLE", classification: "other_graph_error", calls: {} };
  }

  const page = getMessengerPageConfig(input.storeSlug);
  const appId = process.env.MESSENGER_APP_ID?.trim();
  const appAccessToken = process.env.MESSENGER_APP_ACCESS_TOKEN?.trim();
  if (!page.pageId || !page.accessToken || !appId || !appAccessToken) {
    return { status: "blocked", code: "REPAIR_CONFIGURATION_INCOMPLETE", classification: "other_graph_error", calls: {} };
  }
  if (page.pageId !== EXPECTED_PAGE_ID || appId !== EXPECTED_APP_ID) {
    return { status: "blocked", code: "EXPECTED_ID_MISMATCH", classification: "app_mismatch", calls: {} };
  }

  await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_REPAIR_DIAGNOSIS_STARTED", before: { expectedPageId: EXPECTED_PAGE_ID, expectedAppId: EXPECTED_APP_ID } });
  const [pageById, pageIdentity, app] = await Promise.all([
    graphRequest(`/${encodeURIComponent(page.pageId)}`, page.accessToken, "GET", { fields: "id" }),
    graphRequest("/me", page.accessToken, "GET", { fields: "id" }),
    graphRequest(`/${encodeURIComponent(appId)}`, appAccessToken, "GET", { fields: "id" }),
  ]);
  const calls: Record<string, SafeGraphCall> = { page: pageById.call, pageTokenIdentity: pageIdentity.call, app: app.call };
  const pageByIdMatches = pageById.data?.id === EXPECTED_PAGE_ID;
  const pageIdentityMatches = pageIdentity.data?.id === EXPECTED_PAGE_ID;

  if (!pageById.call.ok || !pageIdentity.call.ok) {
    const failed = !pageById.call.ok ? pageById.call : pageIdentity.call;
    const result: RepairFailure = { status: "blocked", code: "PAGE_TOKEN_VALIDATION_FAILED", classification: classifyTokenFailure(failed), calls };
    await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_REPAIR_DIAGNOSIS_FAILED", after: { code: result.code, classification: result.classification, calls } });
    return result;
  }
  if (!pageByIdMatches || !pageIdentityMatches) {
    const result: RepairFailure = { status: "blocked", code: "PAGE_TOKEN_IDENTITY_MISMATCH", classification: "page_identity_mismatch", calls };
    await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_REPAIR_DIAGNOSIS_FAILED", after: { code: result.code, classification: result.classification, calls } });
    return result;
  }
  if (!app.call.ok || app.data?.id !== EXPECTED_APP_ID) {
    const result: RepairFailure = { status: "blocked", code: "APP_VALIDATION_FAILED", classification: "app_mismatch", calls };
    await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_REPAIR_DIAGNOSIS_FAILED", after: { code: result.code, classification: result.classification, calls } });
    return result;
  }
  await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_REPAIR_DIAGNOSIS_SUCCEEDED", after: { pageTokenMatches: true, appValidated: true, calls } });

  await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_SUBSCRIPTION_WRITE_STARTED", before: { pageId: EXPECTED_PAGE_ID, appId: EXPECTED_APP_ID, fields: REQUIRED_FIELDS } });
  const subscribe = await graphRequest(`/${encodeURIComponent(page.pageId)}/subscribed_apps`, page.accessToken, "POST", { subscribed_fields: REQUIRED_FIELDS.join(",") });
  calls.subscribePage = subscribe.call;
  if (!subscribe.call.ok) {
    const result: RepairFailure = { status: "failed", code: "PAGE_SUBSCRIPTION_WRITE_FAILED", classification: "repair_write_failed", calls };
    await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_SUBSCRIPTION_WRITE_FAILED", after: { code: result.code, calls } });
    return result;
  }
  await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: "MESSENGER_PAGE_SUBSCRIPTION_WRITE_SUCCEEDED", after: { pageId: EXPECTED_PAGE_ID, appId: EXPECTED_APP_ID, fields: REQUIRED_FIELDS, call: subscribe.call } });

  const run = await createMessengerAuditRun({ storeId: input.storeId, storeSlug: input.storeSlug, requestedByUserId: input.requestedByUserId });
  const audit: Pick<MessengerAuditSafeResult, "appValidated" | "pageTokenMatches" | "callbackMatches" | "configuredFields" | "missingFields" | "pageAttached" | "calls"> = {
    appValidated: Boolean(run.appValidated),
    pageTokenMatches: Boolean(run.pageTokenMatches),
    callbackMatches: Boolean(run.callbackMatches),
    configuredFields: run.configuredFields,
    missingFields: run.missingFields,
    pageAttached: Boolean(run.pageAttached),
    calls: (run.callsSafeSummary ?? {}) as MessengerAuditSafeResult["calls"],
  };
  const success = audit.appValidated && audit.pageTokenMatches && audit.callbackMatches && audit.missingFields.length === 0 && audit.pageAttached && Object.values(audit.calls).every((call) => call.ok);
  await record({ actorUserId: input.requestedByUserId, storeId: input.storeId, action: success ? "MESSENGER_PAGE_REPAIR_VERIFIED" : "MESSENGER_PAGE_REPAIR_VERIFICATION_FAILED", after: { auditRunId: run.id, appValidated: audit.appValidated, pageTokenMatches: audit.pageTokenMatches, callbackMatches: audit.callbackMatches, configuredFields: audit.configuredFields, missingFields: audit.missingFields, pageAttached: audit.pageAttached, calls: audit.calls } });
  return { status: "repaired", auditRunId: run.id, audit };
}
