"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { getActiveStoreForRead } from "@/lib/store";
import { getUpgradeEligibility } from "@/server/queries/talent";
import { getReferralsByReferrer } from "@/server/queries/referral";
import { getPointHistory } from "@/server/queries/points";
import { getActiveBonusRules } from "@/server/queries/bonus-rule";
import type {
  CustomerStage,
  PointType,
  ReferralStatus,
  TalentStage,
} from "@prisma/client";
import type { UpgradeEligibility } from "@/types/talent";

/**
 * Growth 頁顧客 drawer 一次取齊資料 — talent / points / referrals / bonus rules。
 *
 * 不在 customer detail 頁面用 — 此處刻意分開，避免 customer detail 拉
 * Growth 才需要的 query。Drawer 是 OWNER / ADMIN 才開得起來，所以
 * action 本身做 staff session 檢查 + 視角店篩選。
 */

export interface GrowthCustomerDrawerPayload {
  customer: {
    id: string;
    name: string;
    phone: string;
    customerStage: CustomerStage;
    talentStage: TalentStage;
    totalPoints: number;
    stageNote: string | null;
    sponsor: { id: string; name: string; phone: string } | null;
  };
  referralCount: number;
  upgradeEligibility: UpgradeEligibility | null;
  recentPoints: Array<{
    id: string;
    type: PointType;
    points: number;
    note: string | null;
    createdAt: string;
  }>;
  bonusRules: Array<{ id: string; name: string; points: number }>;
  referrals: Array<{
    id: string;
    referredName: string;
    referredPhone: string | null;
    status: ReferralStatus;
    note: string | null;
    createdAt: string;
  }>;
}

export async function fetchGrowthCustomerDrawer(
  customerId: string,
): Promise<GrowthCustomerDrawerPayload> {
  const user = await requireStaffSession();
  const activeStoreId = await getActiveStoreForRead(user);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      phone: true,
      storeId: true,
      customerStage: true,
      talentStage: true,
      totalPoints: true,
      stageNote: true,
      sponsor: { select: { id: true, name: true, phone: true } },
      _count: { select: { sponsoredCustomers: true } },
    },
  });
  if (!customer) {
    throw new Error("顧客不存在");
  }

  // 跨店保護 — Growth drawer 是後台 OWNER/ADMIN 操作，比照 customer detail
  // 的視角規則：ADMIN 若有 activeStoreId 必須匹配，OWNER/PARTNER 透過
  // assertStoreAccess 比對 user.storeId。
  if (activeStoreId && customer.storeId !== activeStoreId) {
    throw new Error("無權限存取此顧客");
  }
  assertStoreAccess(user, customer.storeId);

  // 接著拉 talent / referral / points / bonus 並行
  const storeId = activeStoreId ?? customer.storeId;
  const [eligibility, referrals, pointHistory, bonusRules] = await Promise.all([
    getUpgradeEligibility(customerId, activeStoreId).catch(() => null),
    getReferralsByReferrer(customerId).catch(() => []),
    getPointHistory(customerId, { limit: 10 }).catch(() => []),
    getActiveBonusRules(storeId).catch(() => []),
  ]);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      customerStage: customer.customerStage,
      talentStage: customer.talentStage,
      totalPoints: customer.totalPoints ?? 0,
      stageNote: customer.stageNote,
      sponsor: customer.sponsor
        ? {
            id: customer.sponsor.id,
            name: customer.sponsor.name,
            phone: customer.sponsor.phone,
          }
        : null,
    },
    referralCount: customer._count.sponsoredCustomers,
    upgradeEligibility: eligibility,
    recentPoints: pointHistory.map((p) => ({
      id: p.id,
      type: p.type,
      points: p.points,
      note: p.note,
      createdAt:
        p.createdAt instanceof Date
          ? p.createdAt.toISOString()
          : String(p.createdAt),
    })),
    bonusRules: bonusRules.map((r) => ({
      id: r.id,
      name: r.name,
      points: r.points,
    })),
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referredName,
      referredPhone: r.referredPhone,
      status: r.status,
      note: r.note,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    })),
  };
}
