"use server";

/**
 * fetchLiffHealthSummary — LIFF 顧客「我的健康紀錄」server action (PR-H2)
 *
 * LIFF-only read-only 投影：給顧客在 LINE 內查看蒸管家原生健康摘要。
 *
 * 設計合約（mirror fetchLiffWallets / fetchLiffMemberBooking / etc.）：
 *   1. 嚴格 CUSTOMER role only（staff 不該透過 LIFF 看健康摘要）
 *   2. **零 client 參數** — 全走 `requireSession` + `getCanonicalCustomerIdForSession`
 *   3. **不 throw 給 caller** — 全部 status discriminated union
 *   4. **read-only** — 不寫 DB；資料只讀 CustomerHealthRecord
 *   5. **不依賴外站** — HealthFlow 停用後仍可正常顯示
 */

import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  type HealthSummary,
} from "@/lib/health-service";
import { getNativeHealthSummaryForMemberships } from "@/lib/native-health-service";
import { calculateNativeBmi } from "@/lib/native-health-service";
import {
  resolveCentralMemberCustomerForStore,
  resolveCentralMembershipsForUser,
} from "@/server/services/central-member-resolver";
import { healthFlowLiffUrl } from "@/lib/liff/messages";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { createHash, randomUUID } from "node:crypto";
import {
  createHealthflowEntryErrorCode,
  normalizeHealthflowEntryAttemptId,
} from "@/lib/healthflow-entry-correlation";
import { sanitizeHealthflowException } from "@/lib/healthflow-entry-redaction";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  healthRecordFormData,
  healthRecordInputSchema,
} from "@/lib/health-record-input";
import type { SaveCustomerHealthRecordState } from "@/server/actions/customer-health-record";

export async function saveLiffHealthRecord(
  _previous: SaveCustomerHealthRecordState,
  formData: FormData,
): Promise<SaveCustomerHealthRecordState> {
  let user;
  try {
    user = await requireSession();
  } catch {
    return { error: "登入已逾時，請重新從 LINE 開啟此頁" };
  }
  if (user.role !== "CUSTOMER") {
    return { error: "無法確認顧客資料，請重新從 LINE 開啟此頁" };
  }

  const storeSlug = String(formData.get("storeSlug") ?? "");
  const store = await prisma.store.findUnique({
    where: { slug: storeSlug },
    select: { id: true, slug: true },
  });
  if (!store) return { error: "無法確認門市，請回會員中心後再試" };

  try {
    await requireStoreFeature(store.id, FEATURES.AI_HEALTH_SUMMARY);
  } catch {
    return { error: "此店目前尚未開放健康評估" };
  }

  const parsed = healthRecordInputSchema.safeParse(healthRecordFormData(formData));
  if (!parsed.success) {
    return {
      error: "請檢查量測內容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (parsed.data.measuredAt > toLocalDateStr()) {
    return {
      error: "量測日期不可晚於今天",
      fieldErrors: { measuredAt: ["量測日期不可晚於今天"] },
    };
  }

  const membership = await resolveCentralMemberCustomerForStore(user.id, store.id);
  if (!membership) {
    return { error: "無法確認您在此門市的會員資料，請聯繫店家協助" };
  }
  const customer = await prisma.customer.findFirst({
    where: {
      id: membership.customerId,
      storeId: store.id,
      mergedIntoCustomerId: null,
    },
    select: { id: true, height: true },
  });
  if (!customer) return { error: "無法確認顧客資料，請重新登入" };

  try {
    await prisma.customerHealthRecord.upsert({
      where: {
        uq_health_source_record: {
          source: "STEAMFOOT",
          sourceRecordId: parsed.data.requestId,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        customerId: customer.id,
        measuredAt: new Date(`${parsed.data.measuredAt}T00:00:00.000Z`),
        weight: parsed.data.weight,
        bmi: parsed.data.bmi ?? calculateNativeBmi(parsed.data.weight, customer.height),
        bodyFat: parsed.data.bodyFat,
        muscleMass: parsed.data.muscleMass,
        boneMass: parsed.data.boneMass,
        visceralFat: parsed.data.visceralFat,
        bmr: parsed.data.bmr,
        bodyWater: parsed.data.bodyWater,
        metabolicAge: parsed.data.metabolicAge,
        note: parsed.data.note,
        source: "STEAMFOOT",
        sourceRecordId: parsed.data.requestId,
      },
    });
  } catch (error) {
    console.error("[saveLiffHealthRecord] native write failed", {
      customerId: customer.id,
      storeId: store.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "健康資料暫時無法儲存，請稍後再試；本次未寫入任何紀錄" };
  }

  const path = `/s/${store.slug}/liff/health`;
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

// PR-H2c：移除 self-computed score。
// HealthFlow summary API 不回官方 score / riskLevel；Steamfoot 自算的 68 與 HealthFlow
// 原站 86 不一致會誤導顧客。本 action 只回原始 summary，顧客面交給 view 顯示
// metrics + alerts；正式 score 顯示在 HealthFlow 原站，由「查看完整評估」CTA 導過去。
// 長期解：等 HealthFlow API 加 score 欄位（PR-H2d 追蹤）後再 surface。

export type FetchLiffHealthSummaryResult =
  | {
      status: "ok";
      linked: true;
      /** 蒸管家原生 summary（latest + trend + alerts + meta） */
      summary: HealthSummary;
      /** 中央會員解析器確認可讀取的門市數量。 */
      verifiedStoreCount: number;
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
  | HealthflowEntryResultMeta & { status: "ok"; url: string }
  | HealthflowEntryResultMeta & { status: "no_customer" }
  | HealthflowEntryResultMeta & { status: "store_mismatch" }
  | HealthflowEntryResultMeta & { status: "feature_unavailable" }
  | HealthflowEntryResultMeta & { status: "service_unavailable" };

type HealthflowEntryResultMeta = {
  requestId: string;
  attemptId: string;
  errorCode: string;
};

type HealthflowEntryResultStatus = CreateHealthflowEntryUrlResult["status"];

type HealthflowEntryDiagnostics = {
  requestId: string;
  attemptId: string;
  errorCode: string;
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
  const exception = sanitizeHealthflowException(error, sensitiveValues);
  console.error(
    JSON.stringify({
      event: "healthflow_entry_exception",
      requestId: diagnostics.requestId,
      attemptId: diagnostics.attemptId,
      errorCode: diagnostics.errorCode,
      storeSlug: diagnostics.storeSlug,
      name: exception.name,
      message: exception.message,
      stack: exception.stack,
      timestamp: new Date().toISOString(),
    }),
  );
}

export async function createHealthflowEntryUrl(
  storeSlug: string,
  clientAttemptId: string,
): Promise<CreateHealthflowEntryUrlResult> {
  const attemptId = normalizeHealthflowEntryAttemptId(clientAttemptId);
  const diagnostics: HealthflowEntryDiagnostics = {
    requestId: `hf_entry_${randomUUID()}`,
    attemptId,
    errorCode: createHealthflowEntryErrorCode(attemptId),
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
  const resultMeta: HealthflowEntryResultMeta = {
    requestId: diagnostics.requestId,
    attemptId: diagnostics.attemptId,
    errorCode: diagnostics.errorCode,
  };

  let user;
  try {
    user = await requireSession();
  } catch {
    return result({ status: "no_customer", ...resultMeta });
  }
  diagnostics.anonymizedUserId = anonymizeHealthflowEntryId(user.id);
  sensitiveValues.push(user.id);
  if (user.role !== "CUSTOMER") {
    return result({ status: "no_customer", ...resultMeta });
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
      ...resultMeta,
    });
  }
  if (!store) {
    return result({ status: "store_mismatch", ...resultMeta });
  }
  sensitiveValues.push(store.id);

  try {
    await requireStoreFeature(store.id, FEATURES.AI_HEALTH_SUMMARY);
    diagnostics.entitlementPassed = true;
  } catch {
    diagnostics.entitlementPassed = false;
    return result({
      status: "feature_unavailable",
      ...resultMeta,
    });
  }

  let customer;
  try {
    customer = await getCanonicalCustomerForSession(user);
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      ...resultMeta,
    });
  }
  if (!customer) {
    return result({ status: "no_customer", ...resultMeta });
  }
  diagnostics.canonicalCustomerResolved = true;
  diagnostics.anonymizedCustomerId = anonymizeHealthflowEntryId(customer.id);
  sensitiveValues.push(customer.id, customer.storeId);
  diagnostics.resolvedCustomerStoreSlug =
    customer.storeId === store.id ? storeSlug : null;

  let row;
  try {
    row = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { id: true, mergedIntoCustomerId: true },
    });
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      ...resultMeta,
    });
  }
  if (!row || row.mergedIntoCustomerId) {
    return result({ status: "no_customer", ...resultMeta });
  }
  try {
    const state = await createHealthflowBridgeState({
      identityCustomerId: row.id,
      requestedStoreId: store.id,
    });
    console.info("[healthflow bridge] state trace", {
      phase: "state_created",
      fingerprint: await fingerprintHealthflowBridgeState(state),
      requestId: diagnostics.requestId,
      attemptId: diagnostics.attemptId,
      errorCode: diagnostics.errorCode,
    });
    const url = new URL(healthFlowLiffUrl);
    url.search = "";
    url.hash = "";
    url.searchParams.set("state", state);
    return result({
      status: "ok",
      url: url.toString(),
      ...resultMeta,
    });
  } catch (err) {
    logHealthflowEntryException(diagnostics, err, sensitiveValues);
    return result({
      status: "service_unavailable",
      ...resultMeta,
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

  // ── 3. Read canonical customer/store ──
  let customer;
  try {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        storeId: true,
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

  // ── 4. Resolve verified central memberships ───────
  // 僅使用中央會員解析器已驗證的 storeId + customerId 配對；不以電話、姓名
  // 或 email 猜測跨店身分，避免把同名／共用電話的健康資料帶進來。
  let memberships;
  try {
    const resolution = await resolveCentralMembershipsForUser(user.id);
    memberships = resolution.memberships.map((membership) => ({
      storeId: membership.storeId,
      customerId: membership.customerId,
      storeName: membership.storeName,
      storeSlug: membership.storeSlug,
    }));
  } catch (err) {
    console.error("[fetchLiffHealthSummary] central membership resolution failed", err);
    return { status: "service_unavailable" };
  }

  // LIFF 當前 canonical customer 應存在於中央會員結果；若解析器沒有確認，
  // fail closed，不退回單店猜測，以免使用過期 session 顯示不屬於本人的敏感資料。
  if (
    !memberships.some(
      (membership) =>
        membership.storeId === customer.storeId &&
        membership.customerId === customerId,
    )
  ) {
    return { status: "no_customer" };
  }

  // ── 5. Read central-member native summary ─────────
  let summary: HealthSummary;
  try {
    summary = await getNativeHealthSummaryForMemberships(memberships);
  } catch (err) {
    console.error("[fetchLiffHealthSummary] native summary failed", err);
    return { status: "service_unavailable" };
  }

  // `linked: true` 在原生模式代表顧客身分已確認；即使尚無紀錄，畫面也能顯示
  // 「尚無量測」並引導到蒸管家站內量測頁。
  return {
    status: "ok",
    linked: true,
    summary,
    verifiedStoreCount: memberships.length,
  };
}
