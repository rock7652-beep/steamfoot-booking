"use server";

/**
 * fetchLiffHealthSummary — LIFF 顧客「我的健康紀錄」server action (PR-H2)
 *
 * 與既有 dashboard health-section / health-summary / health-history 共存不取代：
 *   - dashboard 端用 `tryAutoLinkHealth` + `getHealthSummarySafe(healthProfileId, { customerId })`
 *     顯示完整評估歷程
 *   - 本 action 是 LIFF-only read-only 投影：給顧客在 LINE 內看自己的最近評估摘要
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
import { createHealthflowBridgeState } from "@/lib/healthflow-identity-bridge";
import {
  getHealthSummarySafe,
  type HealthSummary,
} from "@/lib/health-service";
import { healthFlowLiffUrl } from "@/lib/liff/messages";

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
  | { status: "ok"; url: string }
  | { status: "no_customer" }
  | { status: "store_mismatch" }
  | { status: "service_unavailable" };

export async function createHealthflowEntryUrl(
  storeSlug: string,
): Promise<CreateHealthflowEntryUrlResult> {
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") return { status: "no_customer" };

  let store;
  try {
    store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });
  } catch (err) {
    console.error("[createHealthflowEntryUrl] store query failed", err);
    return { status: "service_unavailable" };
  }
  if (!store) return { status: "store_mismatch" };

  const customer = await getCanonicalCustomerForSession(user);
  if (!customer) return { status: "no_customer" };
  if (customer.storeId !== store.id) return { status: "store_mismatch" };

  let row;
  try {
    row = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { id: true, storeId: true, mergedIntoCustomerId: true },
    });
  } catch (err) {
    console.error("[createHealthflowEntryUrl] customer query failed", err);
    return { status: "service_unavailable" };
  }
  if (!row) return { status: "no_customer" };
  if (row.mergedIntoCustomerId) return { status: "no_customer" };
  if (row.storeId !== store.id) return { status: "store_mismatch" };

  try {
    const state = await createHealthflowBridgeState({
      customerId: row.id,
      storeId: row.storeId,
    });
    const url = new URL(healthFlowLiffUrl);
    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/liff`;
    url.search = "";
    url.hash = "";
    url.searchParams.set("state", state);
    return { status: "ok", url: url.toString() };
  } catch (err) {
    console.error("[createHealthflowEntryUrl] state signing failed", err);
    return { status: "service_unavailable" };
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
        healthProfileId: true,
        healthLinkStatus: true,
      },
    });
  } catch (err) {
    console.error("[fetchLiffHealthSummary] customer query failed", err);
    return { status: "service_unavailable" };
  }
  if (!customer) return { status: "no_customer" };

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
    storeId: user.storeId ?? undefined,
  });
  if (!summary) {
    // HealthFlow API 失敗（safeApi 已 log + monitor）
    return { status: "service_unavailable" };
  }

  return { status: "ok", linked: true, summary };
}
