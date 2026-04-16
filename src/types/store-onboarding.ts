/**
 * B7-5: 建店開通 — 型別定義（最終定稿 v2）
 */

import type { PricingPlan, StorePlanStatus } from "@prisma/client";

// ============================================================
// 建店輸入
// ============================================================

export interface CreateStoreInput {
  /** 店名 */
  name: string;
  /** URL slug（唯一，小寫英數字 + 短橫線，2-30 字元） */
  slug: string;
  /** 方案等級 */
  plan: PricingPlan;
  /** 是否為 Demo 店 */
  isDemo: boolean;

  /** OWNER 必填（name / email / password） */
  owner: OwnerInput;

  /** 自訂網域（可選） */
  domain?: string;
  /** LINE Official Account destination（可選） */
  lineDestination?: string;
  /** 值班排程功能 */
  dutySchedulingEnabled?: boolean;
  /** 初始 STAFF（可選） */
  initialStaff?: StaffInput[];
}

export interface OwnerInput {
  name: string;
  email: string;
  password: string;
}

export interface StaffInput {
  name: string;
  email: string;
  /** UI 角色：STAFF（教練）或 MANAGER（核心教練）→ DB mapping: STAFF→PARTNER, MANAGER→OWNER */
  role: "STAFF" | "MANAGER";
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
  /** 交付網址 — 對應 proxy.ts 實際路由 */
  urls: {
    /** 顧客登入首頁 /s/{slug}/ */
    storefront: string;
    /** 預約頁 /s/{slug}/book */
    booking: string;
    /** 顧客註冊 /s/{slug}/register */
    register: string;
    /** 後台登入 /hq/login（全域，非 store-scoped） */
    adminLogin: string;
    /** 店舖後台 /s/{slug}/admin/dashboard */
    adminDashboard: string;
    /** HQ 店舖管理入口 /hq/dashboard/stores/{storeId} */
    hqStoreDetail: string;
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
}

export interface ChecklistItem {
  key: string;
  label: string;
  status: "pass" | "fail" | "skip";
}
