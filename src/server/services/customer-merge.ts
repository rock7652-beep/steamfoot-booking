import { prisma } from "@/lib/db";
import type { AuthSource, LineLinkStatus, Prisma } from "@prisma/client";

// 第三方身份欄位 — 這些欄位在 placeholder → real 合併時必須搬家。
// 修正欄位時請同步更新 repair script (scripts/repair-line-merge-orphans.ts)。
const THIRD_PARTY_IDENTITY_SELECT = {
  id: true,
  storeId: true,
  phone: true,
  email: true,
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

async function assertPlaceholderHasNoOperationalData(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const counts = await Promise.all([
    tx.booking.count({ where: { customerId } }),
    tx.customerPlanWallet.count({ where: { customerId } }),
    tx.transaction.count({ where: { customerId } }),
    tx.pointRecord.count({ where: { customerId } }),
    tx.referralEvent.count({ where: { customerId } }),
    tx.makeupCredit.count({ where: { customerId } }),
    tx.messageLog.count({ where: { customerId } }),
    tx.checkinPost.count({ where: { customerId } }),
    tx.customerFollowUp.count({ where: { customerId } }),
    tx.talentStageLog.count({ where: { customerId } }),
    tx.bookingMakeupCredit.count({ where: { customerId } }),
    tx.referral.count({ where: { OR: [{ referrerId: customerId }, { convertedCustomerId: customerId }] } }),
    tx.customer.count({ where: { sponsorId: customerId } }),
  ]);
  if (counts.some((count) => count > 0)) {
    throw new Error(
      "mergePlaceholder: placeholder has operational data; use mergeCustomerIntoCustomer instead",
    );
  }
}

async function movePlaceholderIdentityLinks(
  tx: Prisma.TransactionClient,
  placeholderCustomerId: string,
  realCustomerId: string,
) {
  const [placeholderLinks, realLinks] = await Promise.all([
    tx.customerIdentityLink.findMany({ where: { customerId: placeholderCustomerId } }),
    tx.customerIdentityLink.findMany({ where: { customerId: realCustomerId } }),
  ]);

  for (const link of placeholderLinks) {
    const targetLink = realLinks.find((candidate) => candidate.provider === link.provider);
    if (!targetLink) {
      await tx.customerIdentityLink.update({
        where: { id: link.id },
        data: { customerId: realCustomerId },
      });
      continue;
    }

    const isSameIdentity =
      targetLink.userId === link.userId &&
      targetLink.storeId === link.storeId &&
      targetLink.providerAccountId === link.providerAccountId &&
      targetLink.lineUserId === link.lineUserId;
    if (!isSameIdentity) {
      throw new Error(
        `mergePlaceholder: CustomerIdentityLink conflict for provider ${link.provider}`,
      );
    }

    await tx.customerIdentityLink.delete({ where: { id: link.id } });
  }
}

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

    // lightweight merge 只適用於真正空白的 OAuth placeholder。若已有方案、交易或
    // 預約，清身份後保留 source 會讓營運資料斷裂，必須改走 guarded full merge。
    // CustomerIdentityLink 是登入身份本身，不是營運資料；安全檢查通過後搬到 real。
    await assertPlaceholderHasNoOperationalData(tx, placeholder.id);
    await movePlaceholderIdentityLinks(tx, placeholder.id, realCustomerId);

    // Step 1: 釋放 placeholder 的 unique 欄位 + userId（為 real 的 update 讓位）
    await tx.customer.update({
      where: { id: placeholder.id },
      data: {
        // phone 為 NOT NULL 且同店 unique，不能清成 null；tombstone 讓位給 real。
        phone: `_merged_${placeholder.id}`,
        email: null,
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

    // Customer.lineUserId is the Messaging API identity. Do not synthesize a
    // LINE Login Account from it; verified Login identities are represented
    // by CustomerIdentityLink and are moved above with the placeholder.

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
// mergeCustomerIntoCustomer (Phase 1 — manual customer→customer merge)
// ============================================================
//
// 用途：店家發現兩筆同店 Customer 是同一個人（例如一筆有 LINE 登入 + 新手機，
// 另一筆有 booking / wallet / points 紀錄），透過後台 /dashboard/customers/merge
// 手動把 source 合併進 target。與 mergePlaceholderCustomerIntoRealCustomer 不同：
//
//   - 必須處理「兩筆都是真人 Customer + FK 已散落各表」的狀況
//   - 在 transaction 內把所有 customerId FK relocate 到 target
//   - source 不刪除，只標記 mergedIntoCustomerId / mergedAt（archive）
//   - source 的 unique 身份欄位（phone / email / lineUserId / googleId / userId）
//     被搬走或清空，避免下次登入 / 建檔誤撞
//   - 兩筆都有 userId 是危險案例，Phase 1 直接 throw（rare；Phase 2 才處理）
//
// FK 清單（請對照 schema.prisma 的 Customer 反向 relations）：
//   - Booking.customerId
//   - Transaction.customerId
//   - CustomerPlanWallet.customerId   （WalletSession 透過 walletId 自動跟著走）
//   - MakeupCredit.customerId
//   - Referral.referrerId / Referral.convertedCustomerId
//   - PointRecord.customerId
//   - MessageLog.customerId
//   - CheckinPost.customerId
//   - TalentStageLog.customerId
//   - ReferralEvent.customerId / ReferralEvent.referrerId
//   - CustomerFollowUp.customerId
//   - CustomerIdentityLink.customerId
//   - BookingMakeupCredit.customerId
//   - Customer.sponsorId（自我參照：把以 source 為 sponsor 的子 customer 改指向 target）
//
// healthProfileId 僅是 Customer 上的字串欄位（非外鍵），由 identity-merge 區段處理。

export type CustomerMergeMovedCounts = {
  bookings: number;
  transactions: number;
  customerPlanWallets: number;
  makeupCredits: number;
  referralsAsReferrer: number;
  referralsAsConverted: number;
  pointRecords: number;
  messageLogs: number;
  checkinPosts: number;
  talentStageLogs: number;
  referralEventsAsCustomer: number;
  referralEventsAsReferrer: number;
  customerFollowUps: number;
  customerIdentityLinks: number;
  bookingMakeupCredits: number;
  sponsoredCustomers: number;
};

export type CustomerMergeOutcome = {
  targetId: string;
  sourceId: string;
  movedCounts: CustomerMergeMovedCounts;
  mergedIdentityFields: string[];
  mergedAt: Date;
};

export type CustomerMergeInput = {
  sourceCustomerId: string;
  targetCustomerId: string;
  performedByUserId: string;
};

// 身份欄位：unique 限制下 source 必須讓位（搬到 target 後在 source 清空）
//
// `phone` 在 schema 是 NOT NULL（其他欄位皆 nullable），不能設為 null。
// 改用 tombstone：`_merged_<sourceId>` — 唯一、非 null、明顯可識別已被合併。
// schema 上 phone 走 @@unique([storeId, phone])，sourceId 為 cuid 保證 tombstone 唯一。
const UNIQUE_NULLABLE_IDENTITY_KEYS = [
  "email",
  "lineUserId",
  "googleId",
  "lineBindingCode",
] as const;

// 非 unique 但屬於「身份/帳號」級別的欄位 — null 不覆寫已有值
const NON_UNIQUE_IDENTITY_KEYS = [
  "lineName",
  "lineLinkStatus",
  "lineLinkedAt",
  "lineBindingCodeCreatedAt",
  "avatar",
  "authSource",
] as const;

// Profile 補位欄位 — target 沒值且 source 有值才補
const PROFILE_FALLBACK_KEYS = [
  "gender",
  "birthday",
  "height",
  "address",
  "notes",
  "healthProfileId",
  "healthLinkStatus",
  "healthSyncedAt",
] as const;

type FullCustomer = Prisma.CustomerGetPayload<Record<string, never>>;

function buildIdentityMerge(
  source: FullCustomer,
  target: FullCustomer,
): {
  targetUpdate: Prisma.CustomerUncheckedUpdateInput;
  sourceClear: Prisma.CustomerUncheckedUpdateInput;
  mergedFields: string[];
} {
  const targetUpdate: Prisma.CustomerUncheckedUpdateInput = {};
  const sourceClear: Prisma.CustomerUncheckedUpdateInput = {};
  const mergedFields: string[] = [];

  // unique 且 nullable 的欄位：target 為空且 source 有值 → 搬過去 + source 清成 null
  for (const key of UNIQUE_NULLABLE_IDENTITY_KEYS) {
    const sVal = source[key];
    const tVal = target[key];
    if (sVal != null && tVal == null) {
      (targetUpdate as Record<string, unknown>)[key] = sVal;
      mergedFields.push(key);
    }
    // 不論是否被 target 採用，source 一律清空避免之後 unique 撞牆
    if (sVal != null) {
      (sourceClear as Record<string, unknown>)[key] = null;
    }
  }

  // phone 特殊處理：schema NOT NULL + @@unique([storeId, phone])
  // → 用 tombstone 取代 null，避免違反 NOT NULL
  if (source.phone != null) {
    if (target.phone == null) {
      targetUpdate.phone = source.phone;
      mergedFields.push("phone");
    }
    sourceClear.phone = `_merged_${source.id}`;
  }

  // 非 unique 身份：target 為空且 source 有值 → 補；source 不清（保留 audit）
  for (const key of NON_UNIQUE_IDENTITY_KEYS) {
    const sVal = source[key];
    const tVal = target[key];
    if (key === "lineLinkStatus") {
      // 取「最綁定」的：LINKED > BLOCKED > UNLINKED
      const merged = pickLinkStatus(source.lineLinkStatus, target.lineLinkStatus);
      if (merged !== target.lineLinkStatus) {
        targetUpdate.lineLinkStatus = merged;
        mergedFields.push("lineLinkStatus");
      }
      continue;
    }
    if (sVal != null && tVal == null) {
      (targetUpdate as Record<string, unknown>)[key] = sVal;
      mergedFields.push(key);
    }
  }

  // Profile 補位
  for (const key of PROFILE_FALLBACK_KEYS) {
    const sVal = source[key];
    const tVal = target[key];
    if (sVal != null && (tVal == null || tVal === "" || tVal === "unlinked")) {
      (targetUpdate as Record<string, unknown>)[key] = sVal;
      mergedFields.push(key);
    }
  }

  return { targetUpdate, sourceClear, mergedFields };
}

export async function mergeCustomerIntoCustomer(
  input: CustomerMergeInput,
): Promise<CustomerMergeOutcome> {
  const { sourceCustomerId, targetCustomerId, performedByUserId } = input;

  if (!sourceCustomerId || !targetCustomerId) {
    throw new Error("mergeCustomer: sourceCustomerId 和 targetCustomerId 皆為必填");
  }
  if (sourceCustomerId === targetCustomerId) {
    throw new Error("mergeCustomer: 來源與目標不可相同");
  }
  if (!performedByUserId) {
    throw new Error("mergeCustomer: performedByUserId 必填（audit 用）");
  }

  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.customer.findUnique({ where: { id: sourceCustomerId } }),
      tx.customer.findUnique({ where: { id: targetCustomerId } }),
    ]);

    if (!source) {
      throw new Error(`mergeCustomer: 找不到來源顧客 ${sourceCustomerId}`);
    }
    if (!target) {
      throw new Error(`mergeCustomer: 找不到目標顧客 ${targetCustomerId}`);
    }
    if (source.storeId !== target.storeId) {
      throw new Error("mergeCustomer: 不允許跨店合併（來源與目標 storeId 不同）");
    }
    if (source.mergedIntoCustomerId != null) {
      throw new Error(
        `mergeCustomer: 來源顧客已被合併進 ${source.mergedIntoCustomerId}，無法再次合併`,
      );
    }
    if (target.mergedIntoCustomerId != null) {
      throw new Error(
        `mergeCustomer: 目標顧客本身已被合併進 ${target.mergedIntoCustomerId}，請改用該筆作為目標`,
      );
    }

    // userId 衝突保險：兩邊都有 userId → Phase 1 直接拒絕
    if (source.userId != null && target.userId != null && source.userId !== target.userId) {
      throw new Error(
        "mergeCustomer: 來源與目標皆已綁定不同的登入帳號（userId）；Phase 1 不自動處理，請先人工取消其中一邊的登入綁定後再合併",
      );
    }

    // LINE target 優先：target 已有 LINE 綁定時，source 不可帶不同 LINE 覆蓋。
    if (
      target.lineUserId != null &&
      source.lineUserId != null &&
      target.lineUserId !== source.lineUserId
    ) {
      throw new Error(
        "mergeCustomer: 來源與目標皆有不同 LINE 綁定（lineUserId）；為避免覆蓋主顧客 LINE，請先人工確認/解綁 source 後再合併",
      );
    }

    const effectiveUserId = target.userId ?? source.userId;
    const [sourcePointRecords, targetPointRecords, identityLinks, googleAccount] = await Promise.all([
      tx.pointRecord.findMany({
        where: { customerId: source.id },
        select: { id: true, sourceType: true, sourceKey: true },
      }),
      tx.pointRecord.findMany({
        where: { customerId: target.id },
        select: { id: true, sourceType: true, sourceKey: true },
      }),
      tx.customerIdentityLink.findMany({
        where: { customerId: { in: [source.id, target.id] } },
        select: { id: true, customerId: true },
      }),
      effectiveUserId
        ? tx.account.findFirst({
            where: { userId: effectiveUserId, provider: "google" },
            select: { userId: true, provider: true, providerAccountId: true },
          })
        : null,
    ]);

    const targetPointKeys = new Map<string, string>();
    for (const record of targetPointRecords) {
      if (record.sourceType == null || record.sourceKey == null) continue;
      targetPointKeys.set(`${record.sourceType}\u0000${record.sourceKey}`, record.id);
    }
    for (const record of sourcePointRecords) {
      if (record.sourceType == null || record.sourceKey == null) continue;
      const targetPointRecordId = targetPointKeys.get(`${record.sourceType}\u0000${record.sourceKey}`);
      if (!targetPointRecordId) continue;
      throw new Error(
        `mergeCustomer: PointRecord unique 衝突；source pointRecord ${record.id} 與 target pointRecord ${targetPointRecordId} 具有相同 sourceType/sourceKey，需先人工去重`,
      );
    }

    const sourceIdentityLinks = identityLinks.filter((link) => link.customerId === source.id);
    const targetIdentityLinks = identityLinks.filter((link) => link.customerId === target.id);
    if (sourceIdentityLinks.length > 1 || targetIdentityLinks.length > 1) {
      throw new Error(
        "mergeCustomer: CustomerIdentityLink 資料異常；同一 Customer 出現多筆 identity link，請先人工修復",
      );
    }
    if (sourceIdentityLinks.length > 0 && targetIdentityLinks.length > 0) {
      throw new Error(
        "mergeCustomer: 來源與目標皆有 CustomerIdentityLink；customerId 為唯一鍵，請先人工決定保留哪一筆 identity link",
      );
    }
    const createGoogleIdentityLink =
      identityLinks.length === 0 && googleAccount != null && effectiveUserId != null;
    if (createGoogleIdentityLink) {
      const conflictingGoogleLink = await tx.customerIdentityLink.findFirst({
        where: {
          storeId: source.storeId,
          provider: googleAccount.provider,
          providerAccountId: googleAccount.providerAccountId,
        },
        select: { id: true, customerId: true, userId: true },
      });
      if (conflictingGoogleLink) {
        throw new Error(
          `mergeCustomer: Google identity 已綁定 Customer ${conflictingGoogleLink.customerId}，無法建立 target link`,
        );
      }
    }

    // ── Step 1: FK relocation ──
    // 注意：每個 updateMany 在跨店資料下也是安全的，因為 source/target 同 storeId 已驗證；
    // 直接以 customerId === sourceId 找出所有 row 搬到 targetId。
    const [
      bookingsResult,
      transactionsResult,
      walletsResult,
      makeupResult,
      referralsAsReferrerResult,
      referralsAsConvertedResult,
      pointRecordsResult,
      messageLogsResult,
      checkinPostsResult,
      talentStageLogsResult,
      referralEventsAsCustomerResult,
      referralEventsAsReferrerResult,
      customerFollowUpsResult,
      customerIdentityLinksResult,
      bookingMakeupCreditsResult,
      sponsoredResult,
    ] = await Promise.all([
      tx.booking.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.transaction.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.customerPlanWallet.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.makeupCredit.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.referral.updateMany({
        where: { referrerId: source.id },
        data: { referrerId: target.id },
      }),
      tx.referral.updateMany({
        where: { convertedCustomerId: source.id },
        data: { convertedCustomerId: target.id },
      }),
      tx.pointRecord.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.messageLog.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.checkinPost.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.talentStageLog.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.referralEvent.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.referralEvent.updateMany({
        where: { referrerId: source.id },
        data: { referrerId: target.id },
      }),
      tx.customerFollowUp.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.customerIdentityLink.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.bookingMakeupCredit.updateMany({
        where: { customerId: source.id },
        data: { customerId: target.id },
      }),
      tx.customer.updateMany({
        where: { sponsorId: source.id },
        data: { sponsorId: target.id },
      }),
    ]);

    const movedCounts: CustomerMergeMovedCounts = {
      bookings: bookingsResult.count,
      transactions: transactionsResult.count,
      customerPlanWallets: walletsResult.count,
      makeupCredits: makeupResult.count,
      referralsAsReferrer: referralsAsReferrerResult.count,
      referralsAsConverted: referralsAsConvertedResult.count,
      pointRecords: pointRecordsResult.count,
      messageLogs: messageLogsResult.count,
      checkinPosts: checkinPostsResult.count,
      talentStageLogs: talentStageLogsResult.count,
      referralEventsAsCustomer: referralEventsAsCustomerResult.count,
      referralEventsAsReferrer: referralEventsAsReferrerResult.count,
      customerFollowUps: customerFollowUpsResult.count,
      customerIdentityLinks: customerIdentityLinksResult.count,
      bookingMakeupCredits: bookingMakeupCreditsResult.count,
      sponsoredCustomers: sponsoredResult.count,
    };

    // ── Step 2: 身份欄位合併 ──
    const { targetUpdate, sourceClear, mergedFields } = buildIdentityMerge(source, target);

    // userId 特殊處理：target 為 null 且 source 有 → 搬過去
    if (target.userId == null && source.userId != null) {
      targetUpdate.userId = source.userId;
      sourceClear.userId = null;
      mergedFields.push("userId");
    }

    // sponsorId：若 source 有 sponsor 且 target 沒，順便補上（避免推薦關係遺失）
    if (source.sponsorId != null && target.sponsorId == null && source.sponsorId !== target.id) {
      targetUpdate.sponsorId = source.sponsorId;
      mergedFields.push("sponsorId");
    }

    // ── Step 3: 先清 source 的 unique 欄位 + userId（讓 target 的 update 不撞 unique）──
    if (Object.keys(sourceClear).length > 0) {
      await tx.customer.update({
        where: { id: source.id },
        data: sourceClear,
      });
    }

    // ── Step 4: 更新 target ──
    if (Object.keys(targetUpdate).length > 0) {
      await tx.customer.update({
        where: { id: target.id },
        data: targetUpdate,
      });
    }

    // 沒有既有 link 時，將已驗證的 Google Account 建成 store-scoped identity truth。
    // Account 的 userId 必須與 merge 後 Target 的 userId 相同（上方 query 已限定）。
    if (createGoogleIdentityLink && googleAccount && effectiveUserId) {
      await tx.customerIdentityLink.create({
        data: {
          userId: effectiveUserId,
          storeId: target.storeId,
          customerId: target.id,
          provider: googleAccount.provider,
          providerAccountId: googleAccount.providerAccountId,
        },
      });
    }

    // ── Step 5: archive source（標記 mergedInto + mergedAt）──
    const mergedAt = new Date();
    await tx.customer.update({
      where: { id: source.id },
      data: {
        mergedIntoCustomerId: target.id,
        mergedAt,
        // 來源停權，避免後續 UI / API 仍把它當活的顧客處理
        selfBookingEnabled: false,
        lineLinkStatus: "UNLINKED",
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: performedByUserId,
        targetType: "Customer",
        targetId: target.id,
        action: "MERGE_DUPLICATE_CUSTOMER",
        beforeJson: {
          sourceCustomerId: source.id,
          targetCustomerId: target.id,
          storeId: target.storeId,
        },
        afterJson: {
          sourceCustomerId: source.id,
          targetCustomerId: target.id,
          movedCounts,
          mergedFields,
          mergedAt: mergedAt.toISOString(),
        },
      },
    });

    // Structured runtime log complements the durable AuditLog without storing PII.
    console.info("[mergeCustomerIntoCustomer] merge completed", {
      sourceId: source.id,
      targetId: target.id,
      storeId: target.storeId,
      performedByUserId,
      movedCounts,
      mergedFields,
    });

    return {
      sourceId: source.id,
      targetId: target.id,
      movedCounts,
      mergedIdentityFields: mergedFields,
      mergedAt,
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
