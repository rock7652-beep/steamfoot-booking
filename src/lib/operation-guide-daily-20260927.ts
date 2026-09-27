import type { OperationGuide } from "./operation-guide-types";

/** Source review at 5e638215. No logged-in operation acceptance is implied. */
export const dailyOperationGuides20260927: OperationGuide[] = [
  {
    id: "H11", category: "analysis", title: "SPA 營運分析怎麼選期間、看開卡與回流？",
    summary: "SPA 使用自己的完成服務與方案銷售資料，依今日、本月或自訂期間顯示客流、開卡與回流。",
    answer: "先選完整期間，再分開核對完成服務人次、不重複來客、體驗開卡與前期顧客回流。",
    path: "SPA 後台 → 分析 → 營運分析", keywords: "SPA 分析 今日 本月 自訂期間 完成服務 不重複來客 首次到店 體驗服務 購買方案 體驗開卡率 回流率 匯出目前分析",
    steps: ["確認目前為 SPA 門市及正確店別，再選今日、本月或自訂起訖日期。", "查看營運摘要、客流與開卡、回流分析；百分比下方會列出分子與分母，並顯示較前期及去年同期。", "具交易查看權限時再核對營收結構與收支；具匯出權限及匯出功能時，可點「匯出目前分析」。"],
    important: "SPA 數字只讀本店 SPA 紀錄，不混入蒸足或課程資料；匯出、營收卡片與一般分析有不同權限。",
    details: ["完成服務以 SPA 已完成預約計算，人次可包含多人預約；不重複來客按顧客去重。", "體驗開卡率為所選期間完成體驗顧客中，於期間結束前首次購買有效 SPA 方案的人數比例；已作廢方案銷售不計。", "回流以完整前一期完成服務的顧客為母體，查看本期再次完成服務的人數；若本期尚未結束，比較期間採相同進度。", "沒有 transaction.read 時仍可看非金額指標，但不顯示營收與收支。查看模式不可匯出；匯出另需 report.export 與資料匯出功能。長期趨勢固定最近六個月。"],
    success: "頁首期間、卡片數字、比較說明與權限顯示一致；匯出檔案標示相同起訖日期。",
    modules: ["spa"], permission: "report.read", feature: "basic_reports", kind: "howto", verification: "source-reviewed",
    sources: ["src/app/(dashboard)/dashboard/reports/spa-analysis-page.tsx", "src/server/queries/spa-analysis.ts", "src/app/api/export/spa-analysis/route.ts", "src/components/report-date-range.tsx", "src/lib/date-utils.ts"],
  },
];
