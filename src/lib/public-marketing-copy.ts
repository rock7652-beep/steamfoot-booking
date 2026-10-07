import { SINGLE_STORE_TRIAL_DAYS, SINGLE_STORE_TRIAL_STAFF } from "./single-store-trial";
import { TRIAL_RETENTION_DAYS } from "./trial-retention";

/** Public copy only: does not grant features or change subscription rules. */
export const PUBLIC_TRIAL_COPY = {
  scope: "所選模組已提供的單店功能完整開放，可體驗母子店管理（母店加一家分店）；人員操作仍依角色權限。",
  limits: `每間試用門市最多 ${SINGLE_STORE_TRIAL_STAFF} 位啟用人員（含店長）、100 筆顧客資料、每月新建預約 100 筆，自動提醒每月 50 次。`,
  activation: `從帳號可正常使用並正式開通當天起算 ${SINGLE_STORE_TRIAL_DAYS} 天；申請不扣款，也不會立即起算。網頁前台可先使用，LINE／LIFF 完成串接後接上。`,
  exclusions: "系統體驗免費，不含代辦金流申請與串接；LINE 訊息、金流等外部服務費用於使用前確認。",
  retention: `試用到期後後台改為唯讀，資料保留 ${TRIAL_RETENTION_DAYS} 天；保留期間轉正式可沿用帳號、顧客、預約與方案資料。超過保留期，請先聯繫總部確認資料狀態。`,
} as const;

export const PUBLIC_WORK_ORDER_DEPENDENCY = "工單可獨立使用；加入商品材料及扣庫存，需另開通進銷存及相應人員權限。";
export const PUBLIC_LINE_DEPENDENCY = "LINE 相關功能需完成串接並啟用店內設定，訊息等外部費用另計。";
export const PUBLIC_SUBSCRIPTION_RETENTION = "加購停用或到期不會因開關直接刪除原有資料；正式訂閱終止後的保存、匯出與刪除，依服務條款及隱私權政策辦理。";

export const PUBLIC_ADDON_GROUPS = [
  { name: "日常加購", purpose: "整理資料、照顧顧客、掌握營運", original: 500, features: [
    { id: "export", name: "資料匯出", description: "下載可匯出的資料，方便整理與核對。" },
    { id: "cash", name: "現金抽屜", description: "記錄現金進出與交班盤點。" },
    { id: "care", name: "顧客經營", description: "追蹤回訪、關懷與續購。" },
    { id: "health", name: "健康追蹤", description: "記錄量測與歷次變化。" },
    { id: "waitlist", name: "課程候補", description: "管理候補與空位遞補。" },
    { id: "analysis", name: "分析", description: "查看營運數據與趨勢。" },
  ] },
  { name: "進階加購", purpose: "處理月結、商品庫存與維修服務", original: 800, features: [
    { id: "settlement", name: "月結管理", description: "整理授課或服務明細與月結金額。" },
    { id: "inventory", name: "進銷存管理", description: "商品、進貨、銷貨與庫存集中管理，掌握收付款。" },
    { id: "work-orders", name: "工單管理", description: "鋼琴調音、管弦與吉他維修保養；接件、進度、收款與取件一處管理，支援雙聯列印。" },
  ] },
] as const;

/** Static application HTML is generated from the same trial copy as React pages. */
export function renderPublicTrialList(): string {
  const labels = ["可用功能", "使用額度", "開通與前台", "費用與限制", "到期與資料"];
  const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return Object.values(PUBLIC_TRIAL_COPY).map((text, index) => `<li><strong>${labels[index]}：</strong>${escapeHtml(text)}</li>`).join("\n");
}
