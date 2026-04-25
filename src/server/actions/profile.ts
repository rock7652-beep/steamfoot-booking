"use server";

import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { compareSync, hashSync } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getStoreContext } from "@/lib/store-context";
import {
  resolveCustomerForUser,
  resolveCustomerCompletionStatus,
} from "@/server/queries/customer-completion";
import {
  mergePlaceholderCustomerIntoRealCustomer,
  resolveAuthSourceFromAccounts,
} from "@/server/services/customer-merge";
import { bindReferralToCustomer } from "@/server/services/referral-binding";
import { normalizePhone } from "@/lib/normalize";
import type { UserRole } from "@prisma/client";

// ============================================================
// Stale session 自癒：保證 User row 存在
// ============================================================
// 場景：清庫 / staff 手動刪 user 後，舊 JWT cookie 仍帶 session.user.id 指向
// 已不存在的 User row。Case D create customer 會撞 FK (userId 對不到 User) → P2003。
// 對策：把該 user.id 重新建出來（同 id），後續 create/update 就能成功。
// 一定的安全考量：
//   - 用同一個 id（保留原 JWT.sub），避免改 session
//   - 角色用 session.role（CUSTOMER）
//   - email 撞 unique 時清掉重試（顧客之後可在 profile 補）
async function ensureUserExists(user: {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
}): Promise<{ recreated: boolean }> {
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true },
  });
  if (existing) return { recreated: false };

  console.warn(
    "[ensureUserExists] session user.id STALE — recreating User row to recover",
    { userId: user.id, sessionRole: user.role, sessionEmail: user.email },
  );

  try {
    await prisma.user.create({
      data: {
        id: user.id,
        name: user.name ?? "顧客",
        email: user.email,
        role: user.role,
        status: "ACTIVE",
      },
    });
    return { recreated: true };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      // email 已被別人佔（罕見：清庫後 staff 拿同 email 建了帳號）
      // → 不帶 email 重建；顧客之後可在 profile 補正確 email
      console.warn(
        "[ensureUserExists] P2002 on email — retrying without email",
        { userId: user.id, conflictEmail: user.email },
      );
      await prisma.user.create({
        data: {
          id: user.id,
          name: user.name ?? "顧客",
          role: user.role,
          status: "ACTIVE",
        },
      });
      return { recreated: true };
    }
    throw err;
  }
}

// ============================================================
// 更新個人資料
// ============================================================

export type ProfileState = { error: string | null; success: boolean };

// ============================================================
// Auto-merge 候選查找（同店 + 優先順序匹配）
// ============================================================
// LINE/Google OAuth 首登若無 LINE-provided email，auth.ts 只會建出 phone=_oauth_xxx
// 的佔位 Customer。等顧客在 profile 補資料時，這支 helper 才能用 phone / lineUserId /
// email 找到 staff 早就建好的真人 Customer，由 caller 呼叫 mergePlaceholder 合併。
//
// 匹配優先順序（同店內逐層嘗試；上一層命中即回，不再往下看）：
//   1. storeId + normalizedPhone   — 使用者主動輸入，最強信號
//   2. storeId + lineUserId        — LINE OAuth 身分
//   3. storeId + normalizedEmail   — OAuth/輸入的 email
//
// 結果：
//   - 0 筆 → 無 candidate（caller 走 update / create）
//   - 1 筆 → 該 candidate（matchedBy 標明命中欄位）
//   - 2+ 筆 同一層 → ambiguous（請使用者聯繫店家）
//
// 安全 guard 在 caller 端：若 real.userId 已被另一 user 佔用（!== current user），
// caller 必須 BLOCK 並請顧客聯繫店家人工協助，並以 console.warn 留 HIGH_RISK audit log。
// 理由：LINE OAuth 只能證明 LINE 身分，不能證明輸入的 phone/email 是本人。
// 已知髒資料案例由 cleanup script 明確 merge，不走自動流程。
type MergeCandidate = {
  id: string;
  userId: string | null;
  phone: string | null;
  email: string | null;
  lineUserId: string | null;
};

type MergeMatchedBy = "phone" | "lineUserId" | "email";

type MergeProbe =
  | { kind: "none" }
  | { kind: "found"; real: MergeCandidate; matchedBy: MergeMatchedBy }
  | { kind: "ambiguous"; matchedBy: MergeMatchedBy; candidates: MergeCandidate[] };

const MERGE_CANDIDATE_SELECT = {
  id: true,
  userId: true,
  phone: true,
  email: true,
  lineUserId: true,
} as const;

async function findRealCustomerForMerge(opts: {
  storeId: string;
  phone: string;
  email: string;
  lineUserId?: string | null;
  excludeCustomerId?: string | null;
}): Promise<MergeProbe> {
  const { storeId, phone, email, lineUserId, excludeCustomerId } = opts;
  const baseWhere = {
    storeId,
    ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
  };

  const tryLayer = async (
    matchedBy: MergeMatchedBy,
    where: Record<string, unknown>,
  ): Promise<MergeProbe | null> => {
    const candidates = await prisma.customer.findMany({
      where: { ...baseWhere, ...where },
      select: MERGE_CANDIDATE_SELECT,
      take: 2,
    });
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
      return { kind: "found", real: candidates[0], matchedBy };
    }
    return { kind: "ambiguous", matchedBy, candidates };
  };

  // 1. phone — 即使 placeholder 自身帶 _oauth_ phone 也不會誤中（excludeCustomerId 排除）
  const byPhone = await tryLayer("phone", { phone });
  if (byPhone) return byPhone;

  // 2. lineUserId — 僅 LINE OAuth user 有；其他身分 skip
  if (lineUserId) {
    const byLine = await tryLayer("lineUserId", { lineUserId });
    if (byLine) return byLine;
  }

  // 3. email — 最後一層
  if (email) {
    const byEmail = await tryLayer("email", { email });
    if (byEmail) return byEmail;
  }

  return { kind: "none" };
}

// 從 user 的 OAuth Account 取出 LINE user id（若有）— merge 優先順序 #2 需要
async function getLineUserIdForUser(userId: string): Promise<string | null> {
  const acct = await prisma.account.findFirst({
    where: { userId, provider: "line" },
    select: { providerAccountId: true },
  });
  return acct?.providerAccountId ?? null;
}

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  // 包一層 outer try/catch 保證 client 一定拿到明確訊息，不再 silent fail
  try {
    return await updateProfileActionInner(formData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const prismaCode = (err as { code?: string })?.code;
    const prismaMeta = (err as { meta?: { target?: string[]; field_name?: string } })?.meta;
    console.error("[updateProfileAction] uncaught", {
      prismaCode,
      prismaTarget: prismaMeta?.target,
      prismaFieldName: prismaMeta?.field_name,
      error: msg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      error: "系統忙碌中，請稍後再試。若持續發生請聯繫店家。",
      success: false,
    };
  }
}

async function updateProfileActionInner(formData: FormData): Promise<ProfileState> {
  const user = await requireSession();

  // ── Diagnostic context — 一次取齊 request / cookie / session 全貌 ──────
  // 任何 early return 之前都先有這份 log，便於排查「登入狀態異常 / 店舖異常」等
  // 抽象訊息背後的真實原因。
  const { headers, cookies } = await import("next/headers");
  const headerList = await headers();
  const cookieStore = await cookies();
  const requestPath = headerList.get("x-next-pathname") ?? "(unknown)";
  // NextAuth session cookie 名稱在 v5 / v4 / secure / non-secure 變體
  const hasAuthToken = !!(
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value ||
    cookieStore.get("next-auth.session-token")?.value ||
    cookieStore.get("__Secure-next-auth.session-token")?.value
  );
  const storeSlugCookie = cookieStore.get("store-slug")?.value ?? null;

  if (user.role !== "CUSTOMER") {
    console.warn("[updateProfileAction] non-customer attempt", {
      requestPath,
      userId: user.id,
      role: user.role,
    });
    return { error: "權限不足", success: false };
  }

  // session.user.id 必為非空才能寫 DB；NextAuth 應保證但 defensive
  if (!user.id) {
    console.error("[updateProfileAction] session has empty user.id", {
      requestPath,
      hasAuthToken,
      storeSlugCookie,
      sessionRole: user.role,
      sessionCustomerId: user.customerId ?? null,
      sessionStoreId: user.storeId ?? null,
    });
    return { error: "請重新登入後再試", success: false };
  }

  const name = (formData.get("name") as string)?.trim();
  // 電話輸入寬容：0912-345-678 / 0912 345 678 / +886912345678 / 0912345678
  // 一律經 normalizePhone 吸成 09xxxxxxxx 後存 / 查
  const phoneRaw = (formData.get("phone") as string) ?? "";
  const phone = normalizePhone(phoneRaw);
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const gender = (formData.get("gender") as string)?.trim();
  const birthdayStr = (formData.get("birthday") as string)?.trim();
  const heightStr = (formData.get("height") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null; // 僅 notes 保持可空

  // 必填驗證（除 notes 外皆必填）
  if (!name) return { error: "請輸入姓名", success: false };
  if (!phone) return { error: "請輸入手機號碼", success: false };
  if (!email) return { error: "請輸入 Email", success: false };
  if (!gender) return { error: "請選擇性別", success: false };
  if (!birthdayStr) return { error: "請選擇生日", success: false };
  if (!heightStr) return { error: "請輸入身高", success: false };
  if (!address) return { error: "請輸入地址", success: false };

  if (!/^09\d{8}$/.test(phone)) {
    return {
      error: `手機號碼格式不正確（09 開頭共 10 碼，實際收到：${phoneRaw.slice(0, 20)}）`,
      success: false,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email 格式不正確", success: false };
  }

  const birthday = new Date(birthdayStr);
  if (isNaN(birthday.getTime())) {
    return { error: "生日格式不正確", success: false };
  }

  const height = parseFloat(heightStr);
  if (isNaN(height) || height < 50 || height > 250) {
    return { error: "身高數值不合理（50-250 cm）", success: false };
  }

  // ── 統一 resolver ───────────────────────────────────
  // 與 profile page render 使用同一支；submit 額外提供 payload email/phone
  // 供 email/phone 唯一匹配 auto-bind。
  const storeCtx = await getStoreContext();
  let storeId = user.storeId ?? storeCtx?.storeId ?? null;
  const storeSlug = storeCtx?.storeSlug ?? null;

  // ── 完整 context log — submit 進入 resolve 前統一印一次 ──────────
  console.info("[updateProfileAction] context", {
    action: "updateProfileAction",
    requestPath,
    hasAuthToken,
    storeSlugCookie,
    userId: user.id,
    sessionRole: user.role,
    sessionCustomerId: user.customerId ?? null,
    sessionStoreId: user.storeId ?? null,
    sessionEmail: user.email ?? null,
    ctxStoreSlug: storeCtx?.storeSlug ?? null,
    ctxStoreId: storeCtx?.storeId ?? null,
    resolvedStoreId: storeId,
    payloadEmail: email,
    payloadPhone: phone,
  });

  // ── 預先驗證 FK：避免 P2003 ─────────────────────────
  // 任何寫入 customer.storeId 前必須確認 Store row 存在，否則 Prisma 會丟 P2003。
  // 常見成因：JWT 內 storeId 指向已刪除的店、或 cookie/session 不一致。
  if (storeId) {
    const storeExists = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!storeExists) {
      console.error("[updateProfileAction] storeId in session is stale", {
        requestPath,
        userId: user.id,
        sessionStoreId: user.storeId,
        ctxStoreId: storeCtx?.storeId ?? null,
        resolvedStoreId: storeId,
      });
      // 嘗試 fallback 到 cookie store context；都不行才放棄
      if (storeCtx?.storeId && storeCtx.storeId !== storeId) {
        const fallback = await prisma.store.findUnique({
          where: { id: storeCtx.storeId },
          select: { id: true },
        });
        if (fallback) {
          storeId = storeCtx.storeId;
        } else {
          return {
            error: "店舖資訊異常，請重新登入後再試。若持續發生請聯繫店家。",
            success: false,
          };
        }
      } else {
        return {
          error: "店舖資訊異常，請重新登入後再試。若持續發生請聯繫店家。",
          success: false,
        };
      }
    }
  }

  // ── Stale session 自癒 — 確保 User row 存在 ──────────
  // 替代原本的「軟驗證 + 等 P2003 catch」做法。原本顧客被刪庫後，舊 cookie 帶
  // 來的 user.id 對 DB 不存在，create customer 會撞 FK 失敗，使用者卡在
  // 「資料儲存失敗」。現在主動補建 User row（同 id），讓下游 create/update 能成功。
  // resolveCustomerForUser 自身已對 stale customerId 做 fall-through。
  const userRecovery = await ensureUserExists({
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role,
  });
  if (userRecovery.recreated) {
    console.info("[updateProfileAction] user recovered from stale session", {
      requestPath,
      userId: user.id,
      sessionCustomerId: user.customerId ?? null,
      note:
        "session.customerId（若有）也視為 stale；resolver 會 fall-through 到 not_found，走 create 流程",
    });
  }

  // ── 存檔後完成度驗證 ─────────────────────────────────
  // 防止「DB 寫完但 layout gate 仍然判定未完成」— 用 layout 同一支 resolver 驗證，
  // 若偵測到仍缺，回傳明確錯誤，不讓 client 收到誤導性的 success=true。
  const verifySuccess = async (savedCustomerId: string): Promise<ProfileState> => {
    revalidatePath("/profile");
    try {
      const status = await resolveCustomerCompletionStatus({
        userId: user.id,
        sessionCustomerId: savedCustomerId,
        sessionEmail: user.email ?? null,
        storeId,
        storeSlug,
      });
      console.info("[updateProfileAction] post-save verify", {
        userId: user.id,
        savedCustomerId,
        isComplete: status.isComplete,
        missing: status.missingFields,
        reason: status.reason,
      });
      if (!status.isComplete) {
        return {
          error: `資料已儲存但 gate 仍判定未完成（缺 ${status.missingFields.join("、")}）。請重新整理頁面，若持續發生請聯繫店家。`,
          success: false,
        };
      }
      return { error: null, success: true };
    } catch (err) {
      console.error("[updateProfileAction] post-save verify threw (treat as success)", {
        userId: user.id,
        savedCustomerId,
        error: err instanceof Error ? err.message : String(err),
      });
      // verify 階段出錯不應阻擋已成功的 DB 寫入；回傳 success，讓 layout 做最後把關
      return { error: null, success: true };
    }
  };

  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId,
    storeSlug: storeCtx?.storeSlug ?? null,
    payloadEmail: email,
    payloadPhone: phone,
  });

  console.info("[updateProfileAction] resolved", {
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId,
    payloadEmail: email,
    payloadPhone: phone,
    resolvedCustomerId: resolved.customer?.id ?? null,
    reason: resolved.reason,
    staleSessionCleared: resolved.staleSessionCleared ?? false,
  });

  // 救援契約：resolver 已對 stale customerId 自動 fall through。
  // 若同時 resolved.staleSessionCleared=true 且 reason=not_found，
  // 必須走 create / re-bind 流程（已在下面 not_found 分支實作），絕不可 throw。
  if (resolved.staleSessionCleared) {
    console.warn(
      "[updateProfileAction] sessionCustomerId was stale — recovery path will create or re-bind customer",
      {
        requestPath,
        userId: user.id,
        staleCustomerId: user.customerId,
        nextReason: resolved.reason,
      },
    );
  }

  // 錯誤訊息分流 — 不要一律顯示「找不到」
  if (!resolved.customer) {
    if (resolved.reason === "conflict_multiple_email") {
      return {
        error: "系統偵測到同店有多筆相同 Email 的顧客資料，請聯繫店家協助確認",
        success: false,
      };
    }
    if (resolved.reason === "conflict_multiple_phone") {
      return {
        error: "系統偵測到同店有多筆相同聯絡電話的顧客資料，請聯繫店家協助確認",
        success: false,
      };
    }
    if (resolved.reason === "conflict_already_linked_email") {
      return {
        error:
          "此 Email 已綁定其他登入帳號。請確認聯絡電話也與您過去留給店家的一致；若確認無誤請聯繫店家協助。",
        success: false,
      };
    }
    if (resolved.reason === "conflict_already_linked_phone") {
      return {
        error:
          "此聯絡電話已綁定其他登入帳號。請確認 Email 也與您過去留給店家的一致；若確認無誤請聯繫店家協助。",
        success: false,
      };
    }
    // not_found — 統一處理：先查「目標店內真人 Customer」再決定 merge / update / create
    if (!storeId) {
      return {
        error: "無法判斷您的所屬店舖，請重新進入店家入口再試",
        success: false,
      };
    }
    try {
      // 1) 同 storeId + (phone OR email) 找真人 Customer（單一 OR 查詢，避免「phone 命中但 email 對不上」誤擋）
      const probe = await findRealCustomerForMerge({ storeId, phone, email });

      if (probe.kind === "ambiguous") {
        console.warn("[updateProfileAction] not_found: ambiguous merge candidates", {
          requestPath,
          userId: user.id,
          storeId,
          payloadPhone: phone,
          payloadEmail: email,
          candidateIds: probe.candidates.map((c) => c.id),
        });
        return {
          error: "系統偵測到同店有多筆顧客資料符合您的電話或 Email，請聯繫店家協助確認。",
          success: false,
        };
      }

      const real = probe.kind === "found" ? probe.real : null;
      const matchedBy = probe.kind === "found" ? probe.matchedBy : null;

      // 2) 當前 user 是否已有 Customer（可能是 auth.ts 首登建的佔位，可能在同/別店）
      const existingByUserId = await prisma.customer.findUnique({
        where: { userId: user.id },
        select: { id: true, storeId: true, phone: true },
      });

      console.info("[updateProfileAction] not_found analysis", {
        userId: user.id,
        sessionStoreId: storeId,
        realId: real?.id ?? null,
        realUserId: real?.userId ?? null,
        realMatchedBy: matchedBy,
        existingByUserIdId: existingByUserId?.id ?? null,
        existingByUserIdStoreId: existingByUserId?.storeId ?? null,
      });

      // ── Case A: 有 real，且 real 與當前使用者的 existing 是不同 row → merge ──
      if (real && (!existingByUserId || existingByUserId.id !== real.id)) {
        // ── 安全 guard：real 已被另一 user 佔用 → BLOCK + 高風險 log ──
        // LINE OAuth 只能證明 LINE 身分，不能證明輸入的 phone/email 是本人。
        // 拒絕靜默覆蓋既有 user 綁定，避免「知道別人電話就能綁進別人顧客資料」的劫持風險。
        // 已知髒資料案例由 cleanup script 明確 merge，不走自動流程。
        if (real.userId && real.userId !== user.id) {
          console.warn(
            "[updateProfileAction] HIGH_RISK Case A: real already linked to another user — blocking auto-merge",
            {
              requestPath,
              userId: user.id,
              placeholderId: existingByUserId?.id ?? null,
              realId: real.id,
              previousUserId: real.userId,
              matchedBy,
              realPhone: real.phone,
              realEmail: real.email,
              payloadPhone: phone,
              payloadEmail: email,
            },
          );
          return {
            error:
              "此電話或 Email 已綁定另一個登入帳號。為保護您的資料安全，請聯繫店家協助合併或確認身分。",
            success: false,
          };
        }
        console.info("[updateProfileAction] Case A → merge", {
          requestPath,
          userId: user.id,
          placeholderId: existingByUserId?.id ?? null,
          realId: real.id,
          realPreviousUserId: real.userId,
          mergedBy: matchedBy,
        });
        // 透過共用 helper 搬 LINE/Google 身份欄位到 real row，並清空/刪除 placeholder
        try {
          const mergeResult = await mergePlaceholderCustomerIntoRealCustomer({
            placeholderCustomerId: existingByUserId?.id ?? null,
            realCustomerId: real.id,
            userId: user.id,
            basicProfile: { name, phone, email, gender, birthday, height, address, notes },
          });
          console.info("[updateProfileAction] Case A merge result", {
            userId: user.id,
            placeholderId: existingByUserId?.id ?? null,
            realId: real.id,
            mergedIdentityKeys: Object.keys(mergeResult.mergedIdentity),
            placeholderDeleted: mergeResult.placeholderDeleted,
            placeholderClearedInPlace: mergeResult.placeholderClearedInPlace,
            skippedReason: mergeResult.skippedReason,
          });
        } catch (txErr) {
          const txCode = (txErr as { code?: string })?.code;
          const txMeta = (txErr as { meta?: { target?: string[] } })?.meta;
          console.error("[updateProfileAction] Case A transaction failed", {
            userId: user.id,
            placeholderId: existingByUserId?.id ?? null,
            realId: real.id,
            prismaCode: txCode,
            prismaTarget: txMeta?.target,
            error: txErr instanceof Error ? txErr.message : String(txErr),
            stack: txErr instanceof Error ? txErr.stack : undefined,
          });
          if (txCode === "P2002") {
            const target = txMeta?.target;
            if (target?.includes("userId")) {
              return {
                error: "系統偵測到此登入帳號已綁定另一筆顧客資料，請聯繫店家協助合併。",
                success: false,
              };
            }
            if (target?.includes("email") || target?.includes("uq_store_customer_email")) {
              return { error: "此 Email 已被其他帳號使用", success: false };
            }
            if (target?.includes("phone") || target?.includes("uq_store_customer_phone")) {
              return { error: "此聯絡電話已被其他帳號使用", success: false };
            }
          }
          throw txErr; // 交給外層 catch
        }

        // User.name 同步為 nice-to-have，失敗不影響整體成功
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { name },
          });
        } catch (userUpdateErr) {
          console.warn("[updateProfileAction] user.name sync failed (non-fatal)", {
            userId: user.id,
            error: userUpdateErr instanceof Error ? userUpdateErr.message : String(userUpdateErr),
          });
        }

        console.info("[updateProfileAction] merged (not_found path)", {
          userId: user.id,
          placeholderId: existingByUserId?.id ?? null,
          realId: real.id,
          mergedBy: matchedBy,
        });
        return verifySuccess(real.id);
      }

      // ── Case B: 有 real，且就是 existing 自己（例如前一次已 merge 綁過）→ 直接 update ──
      if (real && existingByUserId && existingByUserId.id === real.id) {
        await prisma.customer.update({
          where: { id: real.id },
          data: { name, phone, email, gender, birthday, height, address, notes, storeId },
        });
        console.info("[updateProfileAction] updated self (real === existing)", {
          userId: user.id,
          customerId: real.id,
        });
        return verifySuccess(real.id);
      }

      // ── Case C: 目標店無 real，但有 existing（通常是佔位）→ 就地 update 並校正 storeId ──
      if (existingByUserId) {
        await prisma.customer.update({
          where: { id: existingByUserId.id },
          data: {
            name,
            phone,
            email,
            gender,
            birthday,
            height,
            address,
            notes,
            storeId,
          },
        });
        console.info(
          "[updateProfileAction] updated existing-by-userId (no real conflict)",
          {
            userId: user.id,
            customerId: existingByUserId.id,
            existingStoreId: existingByUserId.storeId,
            sessionStoreId: storeId,
          },
        );
        return verifySuccess(existingByUserId.id);
      }

      // ── Case D: 全無既有資料 → create ──
      // authSource 以 user 的 OAuth Account 推定（LINE/GOOGLE/EMAIL），
      // 不再硬寫成 EMAIL 把 LINE/Google 使用者標錯來源。
      const authSource = await resolveAuthSourceFromAccounts(user.id);
      const created = await prisma.customer.create({
        data: {
          name,
          phone,
          email,
          gender,
          birthday,
          height,
          address,
          notes,
          storeId,
          userId: user.id,
          authSource,
          customerStage: "LEAD",
        },
        select: { id: true },
      });
      console.info("[updateProfileAction] customer created on-demand", {
        userId: user.id,
        storeId,
        customerId: created.id,
      });

      // 推薦綁定（從 pending-ref cookie 讀取；靜默失敗）
      // 這個流程處理「補資料／啟用」時首次建立 Customer 的情況，
      // 若使用者曾從 line-entry?ref= 進站，cookie 內會有推薦人 id。
      //
      // Cookie 清除規則（統一）：只要走過 create customer 就清，無論 bind 成功與否
      // — 避免後續 flow 誤用舊 ref、避免重複綁定嘗試。
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const pendingRef =
          cookieStore.get("pending-ref")?.value?.trim() || null;
        if (pendingRef) {
          await bindReferralToCustomer({
            customerId: created.id,
            storeId,
            referrerRef: pendingRef,
            source: "profile-activate",
          });
          cookieStore.delete("pending-ref");
        }
      } catch {
        // 綁定失敗不影響主流程
      }

      return verifySuccess(created.id);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      const prismaCode = (err as { code?: string })?.code;
      const prismaMeta = (err as { meta?: { target?: string[] } })?.meta;
      console.error("[updateProfileAction] not_found branch failed", {
        userId: user.id,
        storeId,
        payloadEmail: email,
        payloadPhone: phone,
        prismaCode,
        prismaTarget: prismaMeta?.target,
        error: errMsg,
        stack: errStack,
      });

      if (prismaCode === "P2002") {
        const target = prismaMeta?.target;
        if (target?.includes("userId")) {
          return {
            error: "系統偵測到此登入帳號已綁定另一筆顧客資料，請聯繫店家協助合併。",
            success: false,
          };
        }
        if (target?.includes("email") || target?.includes("uq_store_customer_email")) {
          return { error: "此 Email 已被其他帳號使用", success: false };
        }
        if (target?.includes("phone") || target?.includes("uq_store_customer_phone")) {
          return { error: "此聯絡電話已被其他帳號使用", success: false };
        }
      }
      if (prismaCode === "P2025") {
        return {
          error: "系統找不到對應資料，請重新整理頁面後再試。",
          success: false,
        };
      }
      if (prismaCode === "P2003") {
        // FK constraint 失敗 — 通常是 storeId 或 userId 對不到。
        // 前置驗證已經擋住絕大多數情況；走到這裡代表罕見競態（例如儲存當下 store 被刪）。
        return {
          error: "資料儲存失敗，請重新整理頁面後再試一次。若持續發生請聯繫店家協助處理。",
          success: false,
        };
      }

      return {
        error: "資料儲存失敗，請稍後再試。若持續發生請聯繫店家。",
        success: false,
      };
    }
  }

  // resolved.customer 存在 → update
  const customerId = resolved.customer.id;
  const customerStoreId = resolved.customer.storeId;

  // ── Placeholder → Real merge 偵測 ─────────────────
  // 情境：auth.ts 在 LINE/Google 首次登入時建了佔位 Customer（phone=_oauth_xxx），
  // 但後台早已有一筆「真人 Customer」（staff 建的）存在，phone/email 對得上。
  // 這時 update 佔位會撞到同店 phone/email unique。
  // 安全條件：真人 Customer 的 userId 為 null（未被佔用）或等於當前使用者。
  const isResolvedPlaceholder =
    resolved.customer.phone.startsWith("_oauth_");

  console.info("[updateProfileAction] dispatch (resolved-customer path)", {
    requestPath,
    userId: user.id,
    customerId,
    customerStoreId,
    customerUserId: resolved.customer.userId,
    isResolvedPlaceholder,
    branch: isResolvedPlaceholder ? "placeholder-merge-or-update" : "plain-update",
    resolveReason: resolved.reason,
  });

  if (isResolvedPlaceholder) {
    try {
      // 同 storeId + (phone OR email) 找 real（排除目前 placeholder 自身），單一 OR 查詢
      const probe = await findRealCustomerForMerge({
        storeId: customerStoreId,
        phone,
        email,
        excludeCustomerId: customerId,
      });

      if (probe.kind === "ambiguous") {
        console.warn("[updateProfileAction] placeholder-merge: ambiguous candidates", {
          requestPath,
          userId: user.id,
          placeholderId: customerId,
          placeholderStoreId: customerStoreId,
          payloadPhone: phone,
          payloadEmail: email,
          candidateIds: probe.candidates.map((c) => c.id),
        });
        return {
          error: "系統偵測到同店有多筆顧客資料符合您的電話或 Email，請聯繫店家協助確認。",
          success: false,
        };
      }

      console.info("[updateProfileAction] placeholder-merge probe", {
        requestPath,
        userId: user.id,
        placeholderId: customerId,
        placeholderStoreId: customerStoreId,
        realFound: probe.kind === "found",
        realId: probe.kind === "found" ? probe.real.id : null,
        realUserId: probe.kind === "found" ? probe.real.userId : null,
        realMatchedBy: probe.kind === "found" ? probe.matchedBy : null,
      });

      if (probe.kind === "found") {
        const real = probe.real;
        // ── 安全 guard：real 已被另一 user 佔用 → BLOCK + 高風險 log ──
        // LINE OAuth 只能證明 LINE 身分，不能證明輸入的 phone/email 是本人。
        // 拒絕靜默覆蓋既有 user 綁定。已知髒資料案例由 cleanup script 明確 merge。
        if (real.userId && real.userId !== user.id) {
          console.warn(
            "[updateProfileAction] HIGH_RISK placeholder-merge: real already linked to another user — blocking auto-merge",
            {
              requestPath,
              userId: user.id,
              placeholderId: customerId,
              realId: real.id,
              previousUserId: real.userId,
              matchedBy: probe.matchedBy,
              realPhone: real.phone,
              realEmail: real.email,
              payloadPhone: phone,
              payloadEmail: email,
            },
          );
          return {
            error:
              "此電話或 Email 已綁定另一個登入帳號。為保護您的資料安全，請聯繫店家協助合併或確認身分。",
            success: false,
          };
        }
        console.info("[updateProfileAction] placeholder-merge → merging", {
          requestPath,
          userId: user.id,
          placeholderId: customerId,
          realId: real.id,
          realPreviousUserId: real.userId,
          mergedBy: probe.matchedBy,
        });

        // 透過共用 helper 搬 LINE/Google 身份欄位到 real row，並清空/刪除 placeholder
        const mergeResult = await mergePlaceholderCustomerIntoRealCustomer({
          placeholderCustomerId: customerId,
          realCustomerId: real.id,
          userId: user.id,
          basicProfile: { name, phone, email, gender, birthday, height, address, notes },
        });

        console.info("[updateProfileAction] placeholder merged into real", {
          userId: user.id,
          placeholderId: customerId,
          realId: real.id,
          mergedBy: probe.matchedBy,
          mergedIdentityKeys: Object.keys(mergeResult.mergedIdentity),
          placeholderDeleted: mergeResult.placeholderDeleted,
          placeholderClearedInPlace: mergeResult.placeholderClearedInPlace,
          skippedReason: mergeResult.skippedReason,
        });

        // 同步 User.name
        await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });

        return verifySuccess(real.id);
      }
      // real 不存在 → 放行繼續下方正常 update（更新佔位並換成使用者輸入的真資料）
    } catch (err) {
      console.error("[updateProfileAction] merge probe failed", {
        userId: user.id,
        customerId,
        err,
      });
      // 不中斷，繼續往下走正常 update；若撞 unique 會由下方 catch 處理
    }
  }

  try {
    // 額外的 unique 檢查：phone/email 是否被「其他」人佔用（同店）
    if (phone !== resolved.customer.phone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { phone, id: { not: customerId }, storeId: customerStoreId },
      });
      if (existingPhone) {
        return { error: "此聯絡電話已被其他帳號使用", success: false };
      }
    }
    if (email !== resolved.customer.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email, id: { not: customerId }, storeId: customerStoreId },
      });
      if (existingEmail) {
        return { error: "此 Email 已被其他帳號使用", success: false };
      }
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { name, phone, email, gender, birthday, height, address, notes },
    });

    // 同步 User.name
    if (resolved.customer.userId) {
      await prisma.user.update({
        where: { id: resolved.customer.userId },
        data: { name },
      });
    }

    return verifySuccess(customerId);
  } catch (error) {
    const prismaCode = (error as { code?: string })?.code;
    const prismaMeta = (error as { meta?: { target?: string[]; field_name?: string } })?.meta;
    console.error("[updateProfileAction] update failed", {
      userId: user.id,
      customerId,
      prismaCode,
      prismaTarget: prismaMeta?.target,
      prismaFieldName: prismaMeta?.field_name,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (prismaCode === "P2002") {
      const target = prismaMeta?.target;
      if (target?.includes("email") || target?.includes("uq_store_customer_email")) {
        return { error: "此 Email 已被其他帳號使用", success: false };
      }
      if (target?.includes("phone") || target?.includes("uq_store_customer_phone")) {
        return { error: "此聯絡電話已被其他帳號使用", success: false };
      }
    }
    if (prismaCode === "P2003") {
      return {
        error: "資料儲存失敗，請重新整理頁面後再試一次。若持續發生請聯繫店家協助處理。",
        success: false,
      };
    }
    if (prismaCode === "P2025") {
      return {
        error: "系統找不到對應資料，請重新整理頁面後再試。",
        success: false,
      };
    }
    return { error: "資料儲存失敗，請稍後再試。若持續發生請聯繫店家。", success: false };
  }
}

// ============================================================
// 修改密碼
// ============================================================

export type ChangePasswordState = { error: string | null; success: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER") {
    return { error: "權限不足", success: false };
  }

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword) return { error: "請輸入目前密碼", success: false };
  if (!newPassword) return { error: "請輸入新密碼", success: false };

  if (!/^\d{4,}$/.test(newPassword)) {
    return { error: "新密碼需為純數字，至少 4 碼", success: false };
  }

  if (newPassword !== confirmPassword) {
    return { error: "兩次密碼不一致", success: false };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      return { error: "帳號異常，請聯繫客服", success: false };
    }

    const valid = compareSync(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return { error: "目前密碼不正確", success: false };
    }

    const newHash = hashSync(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return { error: null, success: true };
  } catch (error) {
    console.error("[changePasswordAction] Error:", error);
    return { error: "修改失敗，請稍後再試", success: false };
  }
}

// ============================================================
// 後台修改密碼（ADMIN / OWNER / STAFF）
// ============================================================

export async function staffChangePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireStaffSession();

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword) return { error: "請輸入目前密碼", success: false };
  if (!newPassword) return { error: "請輸入新密碼", success: false };
  if (newPassword.length < 8) return { error: "新密碼至少 8 碼", success: false };
  if (newPassword !== confirmPassword) return { error: "兩次密碼不一致", success: false };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      return { error: "帳號異常，請聯繫管理者", success: false };
    }

    if (!compareSync(currentPassword, dbUser.passwordHash)) {
      return { error: "目前密碼不正確", success: false };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashSync(newPassword, 10) },
    });

    return { error: null, success: true };
  } catch (error) {
    console.error("[staffChangePasswordAction] Error:", error);
    return { error: "修改失敗，請稍後再試", success: false };
  }
}
