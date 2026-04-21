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

// ============================================================
// 更新個人資料
// ============================================================

export type ProfileState = { error: string | null; success: boolean };

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
  // 電話輸入寬容：允許夾帶空白 / 連字號；server 端先 normalize 再驗證
  const phoneRaw = (formData.get("phone") as string)?.trim() ?? "";
  const phone = phoneRaw.replace(/[\s-]/g, "");
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

  // ── User FK 軟驗證：log 不擋 ──────────────────────────
  // 之前的 hard fail (return 「登入狀態異常」) 在合法新登入流程下也會誤殺，
  // 因為 NextAuth session cookie 寫入與後續第一次 server action 之間若有 cache /
  // replica lag，user.id 雖然合法但這支 prisma client 暫時讀不到。改為：
  //   - 只記 warning，不 return；
  //   - 信任 session.user.id，繼續 resolve / create；
  //   - 若真的 FK 失敗會被下游 P2003 catch 接住，回傳人類可讀訊息。
  // session.user.id 為空已在最上層攔截，此處 user.id 必為非空字串。
  const userExists = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true },
  });
  if (!userExists) {
    console.warn("[updateProfileAction] user.id not found in DB (continuing — P2003 catch will handle if FK fails)", {
      requestPath,
      userId: user.id,
      hasAuthToken,
      sessionRole: user.role,
      sessionCustomerId: user.customerId ?? null,
      sessionStoreId: user.storeId ?? null,
    });
    // 不 return — 繼續 resolve / create 流程
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
  });

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
      // 1) 目標店內，是否已有 phone 或 email 吻合的真人 Customer
      const realByPhone = await prisma.customer.findFirst({
        where: { phone, storeId },
        select: { id: true, userId: true, phone: true, email: true },
      });
      const realByEmail = !realByPhone
        ? await prisma.customer.findFirst({
            where: { email, storeId },
            select: { id: true, userId: true, phone: true, email: true },
          })
        : null;
      const real = realByPhone ?? realByEmail;

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
        realMatchedBy: realByPhone ? "phone" : realByEmail ? "email" : null,
        existingByUserIdId: existingByUserId?.id ?? null,
        existingByUserIdStoreId: existingByUserId?.storeId ?? null,
      });

      // ── Case A: 有 real，且 real 與當前使用者的 existing 是不同 row → merge ──
      if (real && (!existingByUserId || existingByUserId.id !== real.id)) {
        if (real.userId && real.userId !== user.id) {
          // 雙因子校驗：若 payload.phone 與 payload.email 皆與 real 吻合，
          // 視為 onboarding 本人認領 → 允許覆寫 stale userId
          const emailNorm = (s: string | null) =>
            (s ?? "").trim().toLowerCase();
          const phoneNorm = (s: string | null) => (s ?? "").trim();
          const twoFactorMatch =
            phoneNorm(real.phone) === phoneNorm(phone) &&
            emailNorm(real.email) === emailNorm(email);

          if (!twoFactorMatch) {
            console.warn(
              "[updateProfileAction] merge blocked — real owned by another user (single-factor)",
              {
                userId: user.id,
                realId: real.id,
                realUserId: real.userId,
                phoneMatch: phoneNorm(real.phone) === phoneNorm(phone),
                emailMatch: emailNorm(real.email) === emailNorm(email),
              },
            );
            return {
              error:
                "此聯絡電話或 Email 之一與店家紀錄不一致。請再確認兩者皆為您留給店家的資料；若確認無誤請聯繫店家協助。",
              success: false,
            };
          }

          console.warn(
            "[updateProfileAction] two-factor rebind overriding stale userId",
            {
              userId: user.id,
              realId: real.id,
              previousUserId: real.userId,
            },
          );
          // 繼續往下做 merge transaction；second update 會覆寫 real.userId
        }
        // 安全 merge：先釋放 existing 的 userId，再綁定 real 並寫入資料
        const ops = [];
        if (existingByUserId) {
          ops.push(
            prisma.customer.update({
              where: { id: existingByUserId.id },
              data: { userId: null },
            }),
          );
        }
        ops.push(
          prisma.customer.update({
            where: { id: real.id },
            data: {
              userId: user.id,
              name,
              phone,
              email,
              gender,
              birthday,
              height,
              address,
              notes,
            },
          }),
        );
        try {
          await prisma.$transaction(ops);
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
          mergedBy: realByPhone ? "phone" : "email",
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
          authSource: "EMAIL",
          customerStage: "LEAD",
        },
        select: { id: true },
      });
      console.info("[updateProfileAction] customer created on-demand", {
        userId: user.id,
        storeId,
        customerId: created.id,
      });
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

  if (isResolvedPlaceholder) {
    try {
      const realByPhone = await prisma.customer.findFirst({
        where: { phone, id: { not: customerId }, storeId: customerStoreId },
        select: { id: true, userId: true },
      });
      const realByEmail =
        !realByPhone
          ? await prisma.customer.findFirst({
              where: { email, id: { not: customerId }, storeId: customerStoreId },
              select: { id: true, userId: true },
            })
          : null;
      const real = realByPhone ?? realByEmail;

      if (real) {
        if (real.userId && real.userId !== user.id) {
          const emailNorm = (s: string | null) =>
            (s ?? "").trim().toLowerCase();
          const phoneNorm = (s: string | null) => (s ?? "").trim();
          const realFull = await prisma.customer.findUnique({
            where: { id: real.id },
            select: { email: true },
          });
          const twoFactorMatch =
            phoneNorm((real as { phone?: string | null }).phone ?? null) === phoneNorm(phone) ||
            emailNorm(realFull?.email ?? null) === emailNorm(email);
          // Path 1 較嚴格：必須 phone + email 皆對（resolver 已用過一次 factor 匹配到 real）
          const bothMatch =
            phoneNorm((real as { phone?: string | null }).phone ?? null) === phoneNorm(phone) &&
            emailNorm(realFull?.email ?? null) === emailNorm(email);

          if (!bothMatch) {
            console.warn(
              "[updateProfileAction] placeholder-merge blocked (single-factor)",
              {
                userId: user.id,
                placeholderId: customerId,
                realId: real.id,
                realUserId: real.userId,
                twoFactorMatch,
              },
            );
            return {
              error:
                "此聯絡電話或 Email 之一與店家紀錄不一致。請再確認兩者皆為您留給店家的資料；若確認無誤請聯繫店家協助。",
              success: false,
            };
          }
          console.warn(
            "[updateProfileAction] placeholder-merge: two-factor rebind overriding stale userId",
            {
              userId: user.id,
              placeholderId: customerId,
              realId: real.id,
              previousUserId: real.userId,
            },
          );
        }

        // Merge: 先把佔位的 userId 釋放，再把真人 Customer 綁到當前 userId 並更新欄位
        await prisma.$transaction([
          prisma.customer.update({
            where: { id: customerId },
            data: { userId: null },
          }),
          prisma.customer.update({
            where: { id: real.id },
            data: {
              userId: user.id,
              name,
              phone,
              email,
              gender,
              birthday,
              height,
              address,
              notes,
            },
          }),
        ]);

        console.info("[updateProfileAction] placeholder merged into real", {
          userId: user.id,
          placeholderId: customerId,
          realId: real.id,
          mergedBy: realByPhone ? "phone" : "email",
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
