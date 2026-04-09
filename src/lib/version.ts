/**
 * 系統版本常數 — 所有版本相關資訊集中管理
 *
 * 登入頁、Dashboard sidebar、更新橫幅、Changelog 頁面統一引用此檔
 */

export const APP_VERSION = "2.3.0";
export const APP_VERSION_DATE = "2026-04-09";

export type ChangelogTag = "新功能" | "修正" | "優化";
export type AffectedRole = "全部" | "店長" | "員工" | "顧客";

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string; // 簡短摘要，顯示在更新橫幅
  changes: {
    tag: ChangelogTag;
    text: string;
    roles: AffectedRole[];
  }[];
}

/**
 * 版本歷史（最新在前）
 * 更新橫幅顯示第一筆
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.3.0",
    date: "2026-04-09",
    highlights: "每週固定排班模板、預約回退、同頁展開、月曆詳情",
    changes: [
      {
        tag: "新功能",
        text: "每週固定排班模板 — 可將某天的營業時間與時段開關一次套用到未來所有同星期幾日期",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "預約狀態回退 — 已完成/未到/已取消的預約可回退至待確認，堂數自動回補",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "預約管理頁同頁展開 — 點選日期直接展開完整時段表，不再跳頁",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "首頁月曆完整詳情 — 點選日期即可查看時段、名額、預約名單",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "規則推導摘要（Cascade Info）— 顯示每週預設 → 當日覆寫 → 最終結果的推導過程",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "月曆格每日營業摘要 — 顯示營業時間範圍與覆寫數量",
        roles: ["店長"],
      },
      {
        tag: "優化",
        text: "排班模板批次寫入優化 — 52 週資料 3 個 query 完成，避免 timeout",
        roles: ["店長"],
      },
      {
        tag: "修正",
        text: "修復 UTC 時區混用（getDay vs getUTCDay）導致星期判斷錯誤",
        roles: ["全部"],
      },
      {
        tag: "修正",
        text: "修復每週固定規則更新後月曆未即時刷新的問題",
        roles: ["店長"],
      },
    ],
  },
  {
    version: "2.2.0",
    date: "2026-04-08",
    highlights: "規則式時段產生、單日時段覆寫、版本系統",
    changes: [
      {
        tag: "新功能",
        text: "規則式時段產生 — 依據營業規則自動計算可預約時段，支援 30/60/90/120 分鐘間隔與自訂名額",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "單日時段覆寫（SlotOverride）— 可手動關閉、強制開放或調整單一時段容量",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "「設為永久規則」選項 — 從日曆面板直接更新每週固定規則",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "版本系統與更新日誌頁面",
        roles: ["全部"],
      },
      {
        tag: "優化",
        text: "預約頁面動態載入時段，完全同步營業設定",
        roles: ["全部"],
      },
      {
        tag: "修正",
        text: "修復分頁 URLSearchParams undefined 問題",
        roles: ["全部"],
      },
      {
        tag: "修正",
        text: "修復伺服器時區導致的月份判斷錯誤（UTC+8）",
        roles: ["全部"],
      },
      {
        tag: "修正",
        text: "修復更新預約時未檢查 SlotOverride 的問題",
        roles: ["店長", "員工"],
      },
    ],
  },
  {
    version: "2.1.0",
    date: "2026-03-20",
    highlights: "RBAC 權限系統、方案分級",
    changes: [
      {
        tag: "新功能",
        text: "角色權限管理（RBAC）— 支援店長、員工、顧客三級權限",
        roles: ["全部"],
      },
      {
        tag: "新功能",
        text: "方案分級（Free / Basic / Pro）與功能閘門",
        roles: ["店長"],
      },
      {
        tag: "優化",
        text: "側邊欄依權限與方案動態顯示導航項目",
        roles: ["全部"],
      },
    ],
  },
  {
    version: "2.0.0",
    date: "2026-02-15",
    highlights: "系統重構，Next.js App Router",
    changes: [
      {
        tag: "新功能",
        text: "系統全面重構，遷移至 Next.js App Router 架構",
        roles: ["全部"],
      },
      {
        tag: "新功能",
        text: "顧客管理、預約管理、交易紀錄核心功能上線",
        roles: ["全部"],
      },
    ],
  },
];

/** 取得最新版本的 changelog entry */
export function getLatestChangelog(): ChangelogEntry {
  return CHANGELOG[0];
}
