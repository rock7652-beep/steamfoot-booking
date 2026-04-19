"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { toLocalDateStr } from "@/lib/date-utils";
import { REVENUE_TRANSACTION_TYPES } from "@/lib/booking-constants";
import { getStoreFilter } from "@/lib/manager-visibility";

// ============================================================
// Auto-computed customer tags
// ============================================================

export type CustomerTagId =
  | "new_customer"       // 新客（7天內首次到店）
  | "high_value"         // 高價值（月均消費 top 20% 或套票活躍）
  | "at_risk"            // 即將流失（30-60天未到）
  | "dormant"            // 沉睡（60天+未到）
  | "plan_potential"     // 套票潛力（常來但沒套票）
  | "plan_expiring"      // 套票即將到期
  | "birthday_soon"      // 即將生日
  | "vip";               // VIP（累計消費 top 10%）

export interface CustomerTag {
  id: CustomerTagId;
  label: string;
  color: string;        // tailwind bg class
  textColor: string;    // tailwind text class
  description: string;
}

const TAG_DEFS: Record<CustomerTagId, Omit<CustomerTag, "id">> = {
  new_customer:   { label: "新客",       color: "bg-blue-100",   textColor: "text-blue-700",   description: "7天內首次到店" },
  high_value:     { label: "高價值",     color: "bg-amber-100",  textColor: "text-amber-700",  description: "月均消費高或有活躍套票" },
  at_risk:        { label: "即將流失",   color: "bg-orange-100", textColor: "text-orange-700", description: "30-60天未到店" },
  dormant:        { label: "沉睡",       color: "bg-red-100",    textColor: "text-red-700",    description: "60天以上未到店" },
  plan_potential:  { label: "套票潛力",   color: "bg-purple-100", textColor: "text-purple-700", description: "常來消費但尚無套票" },
  plan_expiring:   { label: "套票到期",   color: "bg-rose-100",   textColor: "text-rose-700",   description: "套票14天內到期" },
  birthday_soon:   { label: "即將生日",   color: "bg-pink-100",   textColor: "text-pink-700",   description: "7天內生日" },
  vip:            { label: "VIP",        color: "bg-yellow-100", textColor: "text-yellow-700", description: "累計消費前10%" },
};

function getTagDef(id: CustomerTagId): CustomerTag {
  return { id, ...TAG_DEFS[id] };
}

/**
 * 合併版：一次查詢同時產出 tags + scripts，節省 detail 頁的一次 DB round-trip。
 *
 * 資料來源和 getCustomerTags / getCustomerScript 相同，只是改用更大的 select 覆蓋兩者所需欄位。
 * customer detail 頁請改用這支，個別舊 API 保留供其他呼叫點使用。
 */
export async function getCustomerTagsAndScripts(
  customerId: string,
): Promise<{ tags: CustomerTag[]; scripts: string[] }> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...storeFilter },
    select: {
      name: true,
      firstVisitAt: true,
      lastVisitAt: true,
      birthday: true,
      planWallets: {
        where: { status: "ACTIVE" },
        select: {
          expiryDate: true,
          remainingSessions: true,
          plan: { select: { name: true } },
        },
      },
      bookings: {
        where: { bookingStatus: "COMPLETED" },
        select: { id: true, bookingDate: true },
        orderBy: { bookingDate: "desc" },
      },
      transactions: {
        where: { transactionType: { in: [...REVENUE_TRANSACTION_TYPES] } },
        select: { amount: true, createdAt: true },
      },
    },
  });

  if (!customer) return { tags: [], scripts: [] };

  // ── Tags 計算 ──────────────────────────────────────
  const tags: CustomerTag[] = [];
  const completedCount = customer.bookings.length;
  const hasActivePlan = customer.planWallets.length > 0;
  const totalSpent = customer.transactions.reduce((s, t) => s + Number(t.amount), 0);

  if (customer.firstVisitAt && customer.firstVisitAt >= sevenDaysAgo) {
    tags.push(getTagDef("new_customer"));
  }
  if (customer.lastVisitAt) {
    if (customer.lastVisitAt < sixtyDaysAgo) tags.push(getTagDef("dormant"));
    else if (customer.lastVisitAt < thirtyDaysAgo) tags.push(getTagDef("at_risk"));
  }
  if (hasActivePlan || totalSpent >= 10000) tags.push(getTagDef("high_value"));
  if (totalSpent >= 30000) tags.push(getTagDef("vip"));
  if (completedCount >= 3 && !hasActivePlan) tags.push(getTagDef("plan_potential"));

  const expiringPlan = customer.planWallets.find(
    (w) => w.expiryDate && w.expiryDate <= fourteenDaysFromNow,
  );
  if (expiringPlan) tags.push(getTagDef("plan_expiring"));

  if (customer.birthday) {
    const bMD = customer.birthday.toISOString().slice(5, 10);
    const bThisYear = new Date(`${toLocalDateStr().slice(0, 4)}-${bMD}T00:00:00.000Z`);
    const diffDays = Math.round(
      (bThisYear.getTime() - new Date(toLocalDateStr() + "T00:00:00.000Z").getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (diffDays >= -1 && diffDays <= 7) tags.push(getTagDef("birthday_soon"));
  }

  // ── Scripts 計算 ─────────────────────────────────
  const scripts: string[] = [];
  const daysSinceVisit = customer.lastVisitAt
    ? Math.round((now.getTime() - customer.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (daysSinceVisit !== null && daysSinceVisit > 30) {
    scripts.push(
      `${customer.name} 您好，好久不見！上次到店是 ${daysSinceVisit} 天前，最近身體還好嗎？`,
    );
  } else if (daysSinceVisit !== null && daysSinceVisit <= 7) {
    scripts.push(`${customer.name} 您好，上次消費感覺如何？有需要調整的地方嗎？`);
  } else {
    scripts.push(`${customer.name} 您好！`);
  }

  if (hasActivePlan) {
    const wallet = customer.planWallets[0];
    const daysToExpiry = wallet.expiryDate
      ? Math.round((wallet.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    if (wallet.remainingSessions <= 2) {
      scripts.push(
        `您的「${wallet.plan.name}」剩餘 ${wallet.remainingSessions} 堂，建議趁優惠續購喔！`,
      );
    }
    if (daysToExpiry !== null && daysToExpiry <= 14) {
      scripts.push(`套票將在 ${daysToExpiry} 天後到期，記得把握時間使用！`);
    }
  } else if (totalSpent > 0) {
    scripts.push("目前還沒有套票，購買套票平均可省 30%，有興趣了解嗎？");
  }

  if (customer.birthday) {
    const bMD = customer.birthday.toISOString().slice(5, 10);
    const bThisYear = new Date(`${toLocalDateStr().slice(0, 4)}-${bMD}T00:00:00.000Z`);
    const diffDays = Math.round(
      (bThisYear.getTime() - new Date(toLocalDateStr() + "T00:00:00.000Z").getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (diffDays === 0) {
      scripts.push("今天是您的生日，祝生日快樂！我們有專屬生日優惠喔！");
    } else if (diffDays > 0 && diffDays <= 7) {
      scripts.push(`您的生日快到了（${diffDays} 天後），我們有生日專屬優惠，歡迎來店慶祝！`);
    }
  }

  if (daysSinceVisit !== null && daysSinceVisit > 60) {
    scripts.push("很想念您！我們最近有新的方案，可以約個時間體驗看看嗎？");
  }

  return { tags, scripts };
}

/**
 * Compute auto-tags for a single customer.
 * Used on the customer detail page for real-time display.
 */
export async function getCustomerTags(customerId: string): Promise<CustomerTag[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...storeFilter },
    select: {
      firstVisitAt: true,
      lastVisitAt: true,
      birthday: true,
      planWallets: {
        where: { status: "ACTIVE" },
        select: { expiryDate: true, remainingSessions: true },
      },
      bookings: {
        where: { bookingStatus: "COMPLETED" },
        select: { id: true },
      },
      transactions: {
        where: { transactionType: { in: [...REVENUE_TRANSACTION_TYPES] } },
        select: { amount: true, createdAt: true },
      },
    },
  });

  if (!customer) return [];

  const tags: CustomerTag[] = [];
  const completedCount = customer.bookings.length;
  const hasActivePlan = customer.planWallets.length > 0;
  const totalSpent = customer.transactions.reduce((s, t) => s + Number(t.amount), 0);

  // New customer
  if (customer.firstVisitAt && customer.firstVisitAt >= sevenDaysAgo) {
    tags.push(getTagDef("new_customer"));
  }

  // At risk / dormant
  if (customer.lastVisitAt) {
    if (customer.lastVisitAt < sixtyDaysAgo) {
      tags.push(getTagDef("dormant"));
    } else if (customer.lastVisitAt < thirtyDaysAgo) {
      tags.push(getTagDef("at_risk"));
    }
  }

  // High value: has active plan OR total spent > 10000
  if (hasActivePlan || totalSpent >= 10000) {
    tags.push(getTagDef("high_value"));
  }

  // VIP: total spent > 30000
  if (totalSpent >= 30000) {
    tags.push(getTagDef("vip"));
  }

  // Plan potential: 3+ completed, no active plan
  if (completedCount >= 3 && !hasActivePlan) {
    tags.push(getTagDef("plan_potential"));
  }

  // Plan expiring
  const expiringPlan = customer.planWallets.find(
    (w) => w.expiryDate && w.expiryDate <= fourteenDaysFromNow,
  );
  if (expiringPlan) {
    tags.push(getTagDef("plan_expiring"));
  }

  // Birthday soon
  if (customer.birthday) {
    const todayMD = toLocalDateStr().slice(5);
    const bMD = customer.birthday.toISOString().slice(5, 10);
    const bThisYear = new Date(`${toLocalDateStr().slice(0, 4)}-${bMD}T00:00:00.000Z`);
    const diffDays = Math.round(
      (bThisYear.getTime() - new Date(toLocalDateStr() + "T00:00:00.000Z").getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays >= -1 && diffDays <= 7) {
      tags.push(getTagDef("birthday_soon"));
    }
  }

  return tags;
}

/**
 * Compute suggested talking script based on customer tags and data.
 */
export async function getCustomerScript(customerId: string): Promise<string[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...storeFilter },
    select: {
      name: true,
      lastVisitAt: true,
      firstVisitAt: true,
      birthday: true,
      planWallets: {
        where: { status: "ACTIVE" },
        select: {
          remainingSessions: true,
          expiryDate: true,
          plan: { select: { name: true } },
        },
      },
      bookings: {
        where: { bookingStatus: "COMPLETED" },
        orderBy: { bookingDate: "desc" },
        take: 1,
        select: { bookingDate: true },
      },
      transactions: {
        where: { transactionType: { in: [...REVENUE_TRANSACTION_TYPES] } },
        select: { amount: true },
      },
    },
  });

  if (!customer) return [];

  const scripts: string[] = [];
  const now = new Date();
  const daysSinceVisit = customer.lastVisitAt
    ? Math.round((now.getTime() - customer.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const totalSpent = customer.transactions.reduce((s, t) => s + Number(t.amount), 0);
  const hasActivePlan = customer.planWallets.length > 0;

  // Greeting
  if (daysSinceVisit !== null && daysSinceVisit > 30) {
    scripts.push(`${customer.name} 您好，好久不見！上次到店是 ${daysSinceVisit} 天前，最近身體還好嗎？`);
  } else if (daysSinceVisit !== null && daysSinceVisit <= 7) {
    scripts.push(`${customer.name} 您好，上次消費感覺如何？有需要調整的地方嗎？`);
  } else {
    scripts.push(`${customer.name} 您好！`);
  }

  // Plan info
  if (hasActivePlan) {
    const wallet = customer.planWallets[0];
    const daysToExpiry = wallet.expiryDate
      ? Math.round((wallet.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    if (wallet.remainingSessions <= 2) {
      scripts.push(`您的「${wallet.plan.name}」剩餘 ${wallet.remainingSessions} 堂，建議趁優惠續購喔！`);
    }
    if (daysToExpiry !== null && daysToExpiry <= 14) {
      scripts.push(`套票將在 ${daysToExpiry} 天後到期，記得把握時間使用！`);
    }
  } else if (totalSpent > 0) {
    scripts.push("目前還沒有套票，購買套票平均可省 30%，有興趣了解嗎？");
  }

  // Birthday
  if (customer.birthday) {
    const bMD = customer.birthday.toISOString().slice(5, 10);
    const bThisYear = new Date(`${toLocalDateStr().slice(0, 4)}-${bMD}T00:00:00.000Z`);
    const diffDays = Math.round(
      (bThisYear.getTime() - new Date(toLocalDateStr() + "T00:00:00.000Z").getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 0) {
      scripts.push("今天是您的生日，祝生日快樂！我們有專屬生日優惠喔！");
    } else if (diffDays > 0 && diffDays <= 7) {
      scripts.push(`您的生日快到了（${diffDays} 天後），我們有生日專屬優惠，歡迎來店慶祝！`);
    }
  }

  // Re-engagement
  if (daysSinceVisit !== null && daysSinceVisit > 60) {
    scripts.push("很想念您！我們最近有新的方案，可以約個時間體驗看看嗎？");
  }

  return scripts;
}
