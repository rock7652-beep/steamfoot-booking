import { prisma } from "@/lib/db";
import type { AuthSource, LineLinkStatus, Prisma } from "@prisma/client";

// 第三方身份欄位 — 這些欄位在 placeholder → real 合併時必須搬家。
// 修正欄位時請同步更新 repair script (scripts/repair-line-merge-orphans.ts)。
const THIRD_PARTY_IDENTITY_SELECT = {
  id: true,
  storeId: true,
  userId: true,
  authSource: true,
  lineUserId: true,
  lineName: true,
  lineLinkStatus: true,
  lineLinkedAt: true,
  lineBindingCode: true,
  lineBindingCodeCreatedAt: true,
  googleId: true,
  avatar: true,
} as const;

type IdentityRow = Prisma.CustomerGetPayload<{ select: typeof THIRD_PARTY_IDENTITY_SELECT }>;

export type BasicProfileUpdate = {
  name?: string;
  phone?: string;
  email?: string | null;
  gender?: string | null;
  birthday?: Date | null;
  height?: number | null;
  address?: string | null;
  notes?: string | null;
};

export type MergeInput = {
  placeholderCustomerId: string | null;
  realCustomerId: string;
  userId: string;
  basicProfile?: BasicProfileUpdate;
};

export type MergeResult = {
  realId: string;
  mergedIdentity: Record<string, unknown>;
  placeholderDeleted: boolean;
  placeholderClearedInPlace: boolean;
  skippedReason: string | null;
};

// LINKED > BLOCKED > UNLINKED
function pickLinkStatus(a: LineLinkStatus, b: LineLinkStatus): LineLinkStatus {
  const rank = (s: LineLinkStatus) =>
    s === "LINKED" ? 2 : s === "BLOCKED" ? 1 : 0;
  return rank(a) >= rank(b) ? a : b;
}

function mergeIdentityFields(
  placeholder: IdentityRow,
  real: IdentityRow,
): Prisma.CustomerUncheckedUpdateInput {
  const out: Prisma.CustomerUncheckedUpdateInput = {};

  // lineLinkStatus: 取「最綁定」的
  const mergedStatus = pickLinkStatus(placeholder.lineLinkStatus, real.lineLinkStatus);
  if (mergedStatus !== real.lineLinkStatus) {
    out.lineLinkStatus = mergedStatus;
  }

  // 非 null 欄位：placeholder 的值優先；real 已有值時 placeholder null 不覆蓋
  const preferPlaceholder = <K extends keyof IdentityRow>(key: K) => {
    const pVal = placeholder[key];
    const rVal = real[key];
    if (pVal != null && pVal !== rVal) {
      (out as Record<string, unknown>)[key as string] = pVal;
    }
  };

  preferPlaceholder("lineUserId");
  preferPlaceholder("lineName");
  preferPlaceholder("lineLinkedAt");
  preferPlaceholder("lineBindingCode");
  preferPlaceholder("lineBindingCodeCreatedAt");
  preferPlaceholder("googleId");
  preferPlaceholder("avatar");

  // authSource: real 若為 MANUAL 且 placeholder 有更具體來源（LINE/GOOGLE/EMAIL），採用 placeholder
  if (real.authSource === "MANUAL" && placeholder.authSource !== "MANUAL") {
    out.authSource = placeholder.authSource;
  }

  return out;
}

// ============================================================
// mergePlaceholderCustomerIntoRealCustomer
// ============================================================
// 把 OAuth signIn 所建立的佔位 Customer 合併進真人 Customer。
//
// 行為：
//   1. 讀取 placeholder / real 兩筆 row（同 store 才做完整合併）
//   2. 把 LINE / Google 等第三方身份欄位搬到 real row（null 不覆蓋已有值）
//   3. 同步 basicProfile（姓名/電話/Email/生日…）
//   4. real.userId 指到當前登入 user
//   5. 清掉 placeholder 的 userId + 所有 unique 身份欄位（避免 unique 衝突 / 下次登入誤判）
//   6. 嘗試刪除 placeholder；若有關聯資料（booking/referral…）擋住，保留已清空的 row
//
// 特例：
//   - placeholderCustomerId 為 null → 不做合併，只更新 real (等同純 update)
//   - placeholder 與 real 不在同一 store → 不搬 unique 欄位（跨店 unique 不衝突但容易混淆），
//     僅清空 placeholder 的 userId + 身份欄位避免未來誤判，並記錄 skippedReason
//   - placeholder === real → 不做 merge，只更新 basicProfile
export async function mergePlaceholderCustomerIntoRealCustomer(
  input: MergeInput,
): Promise<MergeResult> {
  const { placeholderCustomerId, realCustomerId, userId, basicProfile } = input;

  if (placeholderCustomerId && placeholderCustomerId === realCustomerId) {
    // 同一筆 — 直接 update basicProfile + userId
    await prisma.customer.update({
      where: { id: realCustomerId },
      data: { userId, ...(basicProfile ?? {}) },
    });
    return {
      realId: realCustomerId,
      mergedIdentity: {},
      placeholderDeleted: false,
      placeholderClearedInPlace: false,
      skippedReason: "placeholder_equals_real",
    };
  }

  return prisma.$transaction(async (tx) => {
    const real = await tx.customer.findUnique({
      where: { id: realCustomerId },
      select: THIRD_PARTY_IDENTITY_SELECT,
    });
    if (!real) {
      throw new Error(`mergePlaceholder: real customer ${realCustomerId} not found`);
    }

    let placeholder: IdentityRow | null = null;
    if (placeholderCustomerId) {
      placeholder = await tx.customer.findUnique({
        where: { id: placeholderCustomerId },
        select: THIRD_PARTY_IDENTITY_SELECT,
      });
    }

    // 無 placeholder → 只 update real
    if (!placeholder) {
      await tx.customer.update({
        where: { id: realCustomerId },
        data: { userId, ...(basicProfile ?? {}) },
      });
      return {
        realId: realCustomerId,
        mergedIdentity: {},
        placeholderDeleted: false,
        placeholderClearedInPlace: false,
        skippedReason: placeholderCustomerId ? "placeholder_not_found" : "no_placeholder_provided",
      };
    }

    // 跨店 placeholder → 不搬 unique 欄位，僅清空 placeholder 避免後續誤判
    if (placeholder.storeId !== real.storeId) {
      await tx.customer.update({
        where: { id: placeholder.id },
        data: {
          userId: null,
          lineUserId: null,
          googleId: null,
          lineBindingCode: null,
        },
      });
      await tx.customer.update({
        where: { id: realCustomerId },
        data: { userId, ...(basicProfile ?? {}) },
      });
      return {
        realId: realCustomerId,
        mergedIdentity: {},
        placeholderDeleted: false,
        placeholderClearedInPlace: true,
        skippedReason: "placeholder_in_different_store",
      };
    }

    const mergedIdentity = mergeIdentityFields(placeholder, real);

    // Step 1: 釋放 placeholder 的 unique 欄位 + userId（為 real 的 update 讓位）
    await tx.customer.update({
      where: { id: placeholder.id },
      data: {
        userId: null,
        lineUserId: null,
        googleId: null,
        lineBindingCode: null,
        lineBindingCodeCreatedAt: null,
      },
    });

    // Step 2: 更新 real — 綁到當前 user、搬身份欄位、更新 basicProfile
    await tx.customer.update({
      where: { id: realCustomerId },
      data: {
        userId,
        ...mergedIdentity,
        ...(basicProfile ?? {}),
      },
    });

    // Step 3: 嘗試刪 placeholder；有關聯資料擋到就保留清空的 row
    let placeholderDeleted = false;
    let placeholderClearedInPlace = true;
    try {
      await tx.customer.delete({ where: { id: placeholder.id } });
      placeholderDeleted = true;
      placeholderClearedInPlace = false;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "P2003" && code !== "P2014") {
        throw err;
      }
      // FK 擋住 → 保留 row（身份欄位已清空，不會再造成 UI / 登入誤判）
      console.warn("[mergePlaceholder] placeholder has FK relations — keeping cleared row", {
        placeholderId: placeholder.id,
        realId: realCustomerId,
        code,
      });
    }

    return {
      realId: realCustomerId,
      mergedIdentity,
      placeholderDeleted,
      placeholderClearedInPlace,
      skippedReason: null,
    };
  });
}

// ============================================================
// resolveAuthSourceFromAccounts
// ============================================================
// 給 Case D create 用 — 根據 user 現有的 OAuth Account 推定 authSource，
// 避免硬寫 EMAIL 把 LINE / Google 使用者標錯來源。
export async function resolveAuthSourceFromAccounts(userId: string): Promise<AuthSource> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true },
  });
  if (accounts.some((a) => a.provider === "line")) return "LINE";
  if (accounts.some((a) => a.provider === "google")) return "GOOGLE";
  if (accounts.length > 0) return "EMAIL";
  // 無任何 OAuth Account → credentials 登入 → 視為 EMAIL
  return "EMAIL";
}
