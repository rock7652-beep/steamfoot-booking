/**
 * B7-5: 建店開通 — 型別定義
 */

import type { PricingPlan, StorePlanStatus } from "@prisma/client";

// ============================================================
// 建店輸入
// ============================================================

export interface CreateStoreInput {
  /** 店名 */
  name: string;
  /** URL slug（唯一，小寫英數字 + 短橫線） */
  slug: string;
  /** 方案等級 */
  plan: PricingPlan;
  /** ShopConfig plan（功能開關層級） */
  shopPlan: "FREE" | "BASIC" | "PRO";
  /** 是否為 Demo 店 */
  isDemo: boolean;
  /** 自訂網域（可選） */
  domain?: string;
  /** LINE Official Account destination（可選） */
  lineDestination?: string;
  /** 值班排程功能 */
  dutySchedulingEnabled?: boolean;

  /** OWNER 必填 */
  owner: StaffInput;
  /** 初始 STAFF（可選） */
  initialStaff?: StaffInput[];
}

export interface StaffInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  displayName: string;
  /** 角色：OWNER 的 role 固定 OWNER，STAFF 可為 OWNER 或 PARTNER */
  role?: "OWNER" | "PARTNER";
  colorCode?: string;
}

// ============================================================
// 建店輸出
// ============================================================

export interface StoreDeliverySummary {
  store: {
    id: string;
    name: string;
    slug: string;
    plan: PricingPlan;
    planStatus: StorePlanStatus;
    isDemo: boolean;
  };
  urls: {
    storefront: string;
    booking: string;
    register: string;
    login: string;
    adminLogin: string;
    adminDashboard: string;
  };
  accounts: {
    owner: AccountSummary;
    staff: AccountSummary[];
  };
  thirdParty: {
    line: "configured" | "not_configured";
    email: "configured" | "not_configured";
  };
  checklist: ChecklistItem[];
  canActivate: boolean;
}

export interface AccountSummary {
  name: string;
  email: string;
  role: string;
  displayName: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
}
