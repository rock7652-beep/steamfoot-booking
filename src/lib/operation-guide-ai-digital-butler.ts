import type { OperationGuide } from "./operation-guide-types";
export const aiDigitalButlerGuide: OperationGuide = {
  id: "AI-BUTLER-PREVIEW-01", category: "care", title: "如何測試 AI 數位店長與真人接手？",
  summary: "目前僅開放合成測試店，先模擬回覆，再確認人工接手與用量。",
  answer: "在數位管家設定內開啟 AI 測試，選擇合成產業及情境並測試回覆；真人接手後須明確恢復 AI。正式客服尚未開放。",
  path: "後台 → 設定 → 通知與顧客經營 → 數位管家",
  keywords: "AI 數位店長 模擬回覆 真人接手 測試 額度 用量 知識庫 未開放",
  steps: ["切換到已授權的合成測試店，從原數位管家入口查看 AI 狀態。", "開啟測試並展開，先選模擬回覆及測試情境；不輸入真實顧客資料。", "點測試回覆，確認回覆、未知問題轉接及用量摘要。", "模擬真人接手後確認 AI 暫停，再明確恢復測試。關閉 AI 不影響原流程、預約或通知。"],
  important: "此功能尚未正式上線。知識庫編輯、真實 LINE/Messenger 客服、即時查詢及預約操作尚未開放。",
  success: "測試回覆及用量可核對，接手後停止 AI，失敗顯示在原位置。",
  details: ["HQ AI 授權獨立於原數位管家與訂閱方案；僅開通權益不會自動啟用客服。", "OpenAI 測試需工程人員先完成隔離、金鑰與預算檢查，供應商費用另計。用量顯示含預留及保守估算，不是實際帳單。"],
  modules: ["steamfoot", "beauty", "course"], permission: "plans.edit", feature: "ai_digital_butler", kind: "howto", verification: "source-reviewed",
  sources: ["src/app/(dashboard)/dashboard/settings/digital-butler/page.tsx", "src/app/(dashboard)/dashboard/settings/digital-butler/ai-panel.tsx", "docs/ai/digital-butler-runbook.md"],
};
