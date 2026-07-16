"use server";

/**
 * fetchLiffHealthSummary — LIFF 顧客「我的健康紀錄」server action (PR-H2)
 *
 * 與既有 dashboard health-section / health-summary / health-history 共存不取代：
 *   - dashboard 端用 `tryAutoLinkHealth` + `getHealthSummarySafe(healthProfileId, { customerId })`
 *     顯示完整評估歷程
 *   - 本 action 是 LIFF-only read-only投影：給顧客在 LINE 內看自己的最近評估摘要
 *     （不含評估歷程列表 / 趨勢圖 — 那些在 dashboard 才有）
 *
 * 設計合約（mirror fetchLiffWallets / fetchLiffMemberBooking / etc.）：
 *   1. 嚴格 CUSTOMER role only（staff 不該透過 LIFF 看健康摘要）
 *   2. **零 client 參數** — 全走 `requireSession` + `getCanonicalCustomerIdForSession`
 *   3. **不 throw 給 caller** — 全部 status discriminated union
 *   4. **read-only** — 不寫 DB、不改 `Customer.healthProfileId / healthLinkStatus`、
 *      不打 `tryAutoLinkHealth`（避免 LIFF 開頁觸發 dashboard 那條 link 流程）
 *   5. **不動 HealthFlow API 契約** — 重用既有 `getHealthSummarySafe` wrapper
 *   6. **不算分數** — 評分用 `computeHealthScore` 即時 compute（mirror dashboard 模式）
 *
 * 不在此 PR 範圍：
 *   - 不接 link / unlink (那是 dashboard server/actions/health.ts)
 *   - 不接量測 / 不接購買 / 不接付款
 *   - 不寫 Customer.healthLinkStatus（即使顧客本次拉到 not_found 也不寫；
 *     維持 dashboard 為唯一 source of truth）
 *   - 不動 schema / migration
 */

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import {
  getCanonicalCustomerForSession,
  getCanonicalCustomerIdForSession,
} from "@/lib/customer-identity";
import {
  createHealthflowBridgeState,
  fingerprintHealthflowBridgeState,
} from "@/lib/healthflow-identity-bridge";
import {
  getHealthSummarySafe,
  type HealthSummary,
} from "@/lib/health-service";
import { healthFlowLiffUrl } from "@/lib/liff/messages";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { createHash, randomUUID } from "node:crypto";

// PR-H2c：移除 self-computed score。
// HealthFlow summary API 不回官方 score / riskLevel；Steamfoot 自算的 68 與 HealthFlow
// 原站 86 不一致會誤導顧客。本 action 只回原始 summary，顧客面交給 view 顯示
// metrics + alerts；正式 score 顯示在 HealthFlow 原站，由「查看完整評估」CTA 導過去。
// 長期解：等 HealthFlow API 加 score 欄位（PR-H2d 追蹤）後再 surface。

export type FetchLiffHealthSummaryResult =
  | {
      status: "ok";
      linked: true;
      /** 完整 HealthFlow summary（latest + trend + alerts + meta） */
      summary: HealthSummary;
    }
  | {
      status: "ok";
      linked: false;
      /** unlinked: 從未連結過 / not_found: dashboard 自動配對失敗 */
      reason: "unlinked" | "not_found" | "error";
    }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

export type CreateHealthflowEntryUrlResult =
  | { status: "ok"; url: string; requestId: string }
  | { status: "no_customer"; requestId: string }
  | { status: "store_mismatch"; requestId: string }
  | { status: "feature_unavailable"; requestId: string }
  | { status: "service_unavailable"; requestId: string };

type HealthflowEntryResultStatus = CreateHealthflowEntryUrlResult["status"];

type HealthflowEntryDiagnostics = {
  requestId: string;
  storeSlug: string;
  anonymizedUserId: string | null;
  anonymizedCustomerId: string | null;
  canonicalCustomerResolved: boolean;
  resolvedCustomerStoreSlug: string | null;
  entitlementPassed: boolean | "unknown";
};

function anonymizeHealthflowEntryId(value: string | null | undefined) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function logHealthflowEntryResult(
  diagnostics: HealthflowEntryDiagnostics,
  resultStatus: HealthflowEntryResultStatus,
) {
  console.info(
    JSON.stringify({
      event: "healthflow_entry_result",
      ...diagnostics,
      resultStatus,
      timestamp: new Date().toISOString(),
    }),
  );
}

function logHealthflowEntryException(
  diagnostics: HealthflowEntryDiagnostics,
  error: unknown,
  sensitiveValues: ReadonlyArray<string | null | undefined> = [],
) {
  const exception = error instanceof Error ? error : new Error(String(error));
  const redact = (value: string | null | undefined): string | null => {
    if (!value) return null;
    return sensitiveValues.reduce<string>(
      (sanitized, sensitive) =>
        sensitive ? sanitized.replaceAll(sensitive, "[REDACTED]") : sanitized,
      value,
    );
  };
  console.error(
    JSON.stringify({
      event: "healthflow_entry_exception",
      requestId: diagnostics.requestId,
      storeSlug: diagnostics.storeSlug,
      name: exception.name,
      message: redact(exception.message),
      stack: redact(exception.stack),
      timestamp: new Date().toISOString(),
    }),
  );
}

export async function createHealthflowEntryUrl(
  storeSlug: string,
): Promise<CreateHealthflowEntryUrlResult> {
  const diagnostics: HealthflowEntryDiagnostics = {
    requestId: `hf_entry_${randomUUID()}`,
    storeSlug,
    anonymizedUserId: null,
    anonymizedCustomerId: null,
    canonicalCustomerResolved: false,
    resolvedCustomerStoreSlug: null,
    entitlementPassed: "unknown",
  };
  const sensitiveValues = [
    process.env.HEALTHFLOW_BRIDGE_SECRET,
    process.env.HEALTHFLOW_CALLBACK_SECRET,
    process.env.HEALTH_API_KEY,
  ];
  const result = <T extends CreateHealthflowEntryUrlResult>(value: T): T => {
    logHealthflowEntryResult(diagnostics, value.status);
    return value;
  };

  let user;
  try {
    user = await requireSession();
  } catch {
    return result({ status: "no_customer", requestId: diagnostics.requestId });
  }
  diagnostics.anonymizedUserId = anonymizeHealthflowEntryId(user.id);
  sensitiveValues.push(user.id);
  if (user.role !== "CUSTOMER") {
    return result({ status: "no_customer", requestId: diagnostics.requestId });
  }

  let store;
  try {
    store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      requestId: diagnostics.requestId,
    });
  }
  if (!store) {
    return result({ status: "store_mismatch", requestId: diagnostics.requestId });
  }
  sensitiveValues.push(store.id);

  try {
    await requireStoreFeature(store.id, FEATURES.AI_HEALTH_SUMMARY);
    diagnostics.entitlementPassed = true;
  } catch {
    diagnostics.entitlementPassed = false;
    return result({
      status: "feature_unavailable",
      requestId: diagnostics.requestId,
    });
  }

  let customer;
  try {
    customer = await getCanonicalCustomerForSession(user);
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      requestId: diagnostics.requestId,
    });
  }
  if (!customer) {
    return result({ status: "no_customer", requestId: diagnostics.requestId });
  }
  diagnostics.canonicalCustomerResolved = true;
  diagnostics.anonymizedCustomerId = anonymizeHealthflowEntryId(customer.id);
  sensitiveValues.push(customer.id, customer.storeId);
  if (customer.storeId !== store.id) {
    return result({ status: "store_mismatch", requestId: diagnostics.requestId });
  }
  diagnostics.resolvedCustomerStoreSlug = storeSlug;

  let row;
  try {
    row = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { id: true, storeId: true, mergedIntoCustomerId: true },
    });
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      requestId: diagnostics.requestId,
    });
  }
  if (!row || row.mergedIntoCustomerId) {
    return result({ status: "no_customer", requestId: diagnostics.requestId });
  }
  if (row.storeId !== store.id) {
    return result({ status: "store_mismatch", requestId: diagnostics.requestId });
  }

  try {
    const state = await createHealthflowBridgeState({
      customerId: row.id,
      storeId: row.storeId,
    });
    console.info("[healthflow bridge] state trace", {
      phase: "state_created",
      fingerprint: await fingerprintHealthflowBridgeState(state),
    });
    const url = new URL(healthFlowLiffUrl);
    url.search = "";
    url.hash = "";
    url.searchParams.set("state", state);
    return result({
      status: "ok",
      url: url.toString(),
      requestId: diagnostics.requestId,
    });
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      requestId: diagnostics.requestId,
    });
  }
}

export async function fetchLiffHealthSummary(): Promise<FetchLiffHealthSummaryResult> {
  // ── 1. Require CUSTOMER session ────────────────────
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") return { status: "no_customer" };

  // ── 2. Resolve canonical customer ──────────────────
  // 不信 session.customerId（可能 stale；同 fetchLiffWallets 設計）。
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) return { status: "no_customer" };

  // ── 3. Read Customer.healthProfileId + linkStatus ──
  // 只讀；不更新（不觸發 dashboard 那條 autoLink 流程）。
  let customer;
  try {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        storeId: true,
        healthProfileId: true,
        healthLinkStatus: true,
      },
    });
  } catch (err) {
    console.error("[fetchLiffHealthSummary] customer query failed", err);
    return { status: "service_unavailable" };
  }
  if (!customer) return { status: "no_customer" };

  try {
    await requireStoreFeature(customer.storeId, FEATURES.AI_HEALTH_SUMMARY);
  } catch {
    // 正常 UI 會在 LIFF page server component 先顯示鎖定狀態；此處保留
    // hard gate，避免頁面已開啟後功能被關閉時仍繼續讀 HealthFlow。
    return { status: "service_unavailable" };
  }

  // ── 4. Branch by linkStatus ────────────────────────
  if (!customer.healthProfileId || customer.healthLinkStatus !== "linked") {
    // 未綁定 / dashboard autoLink 找不到 / 之前綁定失敗
    const reason: "unlinked" | "not_found" | "error" =
      customer.healthLinkStatus === "not_found"
        ? "not_found"
        : customer.healthLinkStatus === "error"
          ? "error"
          : "unlinked";
    return { status: "ok", linked: false, reason };
  }

  // ── 5. Fetch HealthFlow summary (safe wrapper, 5min LRU)
  const summary = await getHealthSummarySafe(customer.healthProfileId, {
    customerId,
    storeId: customer.storeId,
  });
  if (!summary) {
    // HealthFlow API 失敗（safeApi 已 log + monitor）
    return { status: "service_unavailable" };
  }

  return { status: "ok", linked: true, summary };
}
