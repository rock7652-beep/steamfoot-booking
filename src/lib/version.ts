/**
 * 系統版本常數 — 所有版本相關資訊集中管理
 *
 * 登入頁、Dashboard sidebar、更新橫幅、Changelog 頁面統一引用此檔
 */

export const APP_VERSION = "2.5.0";
export const APP_VERSION_DATE = "2026-04-10";

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
    version: "2.5.0",
    date: "2026-04-10",
    highlights: "產品級體驗升級：骨架屏、即時操作回饋、報表快照、效能監控",
    changes: [
      {
        tag: "新功能",
        text: "Skeleton Loading — Dashboard、顧客、預約、報表等 5 個高頻頁面加入骨架屏，載入時不再白屏",
        roles: ["全部"],
      },
      {
        tag: "新功能",
        text: "Optimistic UI — 今日預約出席/未到/取消操作即時更新狀態 badge 與進度條，無需等待伺服器回應",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "顧客狀態更新改為即時回饋，操作後顯示 toast 通知",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "報表預計算 — 過去月份報表自動快照，查詢速度從 ~700ms 降至 ~5ms",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "效能儀表板 — /dashboard/settings/perf 查看頁面效能與快取狀態（OWNER 專屬）",
        roles: ["店長"],
      },
      {
        tag: "優化",
        text: "全系統快取策略升級 — Layout 共用查詢改用 unstable_cache，減少重複 DB 查詢",
        roles: ["全部"],
      },
      {
        tag: "優化",
        text: "Cache invalidation 統一管理 — 所有 mutation 使用 updateTag() 即時失效，不再依賴 TTL 等待",
        roles: ["全部"],
      },
      {
        tag: "優化",
        text: "SLA 效能目標定義 — 關鍵頁面設定載入時間上限，超時自動記錄告警",
        roles: ["店長"],
      },
    ],
  },
  {
    version: "2.4.0",
    date: "2026-04-10",
    highlights: "值班排班系統上線、排班聯動開關、安全預約控制",
    changes: [
      {
        tag: "新功能",
        text: "值班排班系統 — 每日每時段可安排多位值班人員，支援身份角色與參與類型標記",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "三種快速排班：複製到整天（非覆蓋補缺）、從前一營業日複製、複製到本週其他日期（覆蓋式）",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "排班聯動開關 — 啟用後只有已安排值班的時段才開放預約，可隨時關閉恢復",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "啟用聯動時自動提醒本週未排班營業日數量，協助排班完整性檢查",
        roles: ["店長"],
      },
      {
        tag: "新功能",
        text: "OWNER 後台代約可勾選「略過值班檢查」，前台客戶端不受此選項影響",
        roles: ["店長"],
      },
      {
        tag: "優化",
        text: "公休日自動阻擋 — 無法手動新增值班，也無法被複製操作覆蓋",
        roles: ["店長"],
      },
    ],
  },
  {
    version: "2.3.1",
    date: "2026-04-09",
    highlights: "手機端操作回饋全面優化、預約列表快捷操作",
    changes: [
      {
        tag: "優化",
        text: "全系統按鈕加入 loading spinner / 處理中文字 / disabled 防重複點擊",
        roles: ["全部"],
      },
      {
        tag: "優化",
        text: "所有互動操作加入 toast 成功/失敗提示（取代 alert 與無回饋）",
        roles: ["全部"],
      },
      {
        tag: "新功能",
        text: "預約管理列表快捷操作 — 出席/未到/取消/修正可直接在時段卡片操作，無需進入詳情頁",
        roles: ["店長"],
      },
      {
        tag: "優化",
        text: "OAuth 登入按鈕（LINE / Google）加入 loading 狀態與防重複點擊",
        roles: ["全部"],
      },
      {
        tag: "優化",
        text: "載入日期詳情時顯示 spinner 動畫，避免手機端誤以為無回應",
        roles: ["店長"],
      },
      {
        tag: "優化",
        text: "身體數據外部連結加入提示說明，避免 LINE 登入問題造成困惑",
        roles: ["店長"],
      },
    ],
  },
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
