import type { OperationGuide } from "./operation-guide-types";
export const aiDigitalButlerGuide: OperationGuide = {
  id: "AI-BUTLER-PREVIEW-01", category: "care", title: "如何管理 AI 店家知識與測試回覆？",
  summary: "目前僅開放合成測試店；知識先存草稿、再發布，測試引用已發布版本。",
  answer: "在數位管家設定內開啟 AI 測試，選擇合成產業及情境並測試回覆；真人接手後須明確恢復 AI。正式客服尚未開放。",
  path: "後台 → 設定 → 通知與顧客經營 → 數位管家",
  keywords: "AI 數位店長 模擬回覆 真人接手 測試 額度 用量 知識庫 草稿 發布 撤下 FAQ 禁止事項 路由 未命中 串接 去重 待人工處理 恢復 版本衝突 空位 唯讀 查詢 可預約時段",
  steps: ["切換到已授權的合成測試店，從原數位管家入口查看 AI 狀態。", "開啟測試並展開，先選模擬回覆及測試情境；不輸入真實顧客資料。", "點測試回覆，確認回覆、未知問題轉接及用量摘要。", "展開店家知識，填寫介紹、FAQ 與禁止關鍵詞；引用營業時間、公開服務或公開方案定價時，先核對原設定。", "儲存知識草稿後發布；修改草稿不影響已發布版本。版本衝突時保留本機草稿，核對後再重新載入。", "在已發布知識測試區輸入合成問題，先用模擬回覆（完整問題比對），再視授權選用 OpenAI；撤下後停止引用。", "展開原流程與 AI 串接，選合成情境後執行；原流程已命中或處理中時，模擬模型呼叫應為 0。重送上一事件不重複執行。", "測試未命中後的知識回覆及未知轉真人；路由真人接手會同時暫停原流程與 AI，須明確恢復。AI 總停止及店家開關仍有效。", "在 AI 待人工處理查看本店測試對話；先核對處理情況，再準備恢復並確認。結果未知時重試原操作，狀態衝突先重新整理；仍有處理中或待核對事件不能恢復。", "合成蒸足店可展開即時空位查詢，選日期後查詢；結果依顧客預約規則，不建立預約，實際預約仍須重新確認名額。更換日期後須重新查詢。", "模擬真人接手後確認 AI 暫停，再明確恢復測試。關閉 AI 不影響原流程、預約或通知。"],
  important: "此功能尚未正式上線。知識管理僅供隔離測試。合成蒸足僅提供人工觸發的唯讀空位查詢。合成會員另有本人預約唯讀驗收，店長不能選顧客代查。真實 LINE/Messenger 客服、正式會員資料及預約操作尚未開放。",
  success: "測試回覆及用量可核對，接手後停止 AI，失敗顯示在原位置。",
  details: ["HQ AI 授權獨立於原數位管家與訂閱方案；僅開通權益不會自動啟用客服。", "禁止事項採關鍵詞正規化比對，不能取代完整客服規則。引用每次讀取原設定；缺少公開資料、超過六項或安全內容上限時，請先核對來源。", "OpenAI 測試需工程人員先完成隔離、金鑰與預算檢查，供應商費用另計。用量顯示含預留及保守估算，不是實際帳單。"],
  modules: ["steamfoot", "beauty", "course"], permission: "plans.edit", feature: "ai_digital_butler", kind: "howto", verification: "source-reviewed",
  sources: ["src/app/(dashboard)/dashboard/settings/digital-butler/page.tsx", "src/app/(dashboard)/dashboard/settings/digital-butler/ai-panel.tsx", "src/app/(dashboard)/dashboard/settings/digital-butler/ai-knowledge-panel.tsx", "src/app/(dashboard)/dashboard/settings/digital-butler/ai-routing-panel.tsx", "src/app/(dashboard)/dashboard/settings/digital-butler/ai-handoff-panel.tsx", "docs/ai/digital-butler-runbook.md", "docs/ai/digital-butler-availability.md", "docs/ai/digital-butler-member-bookings.md"],
};
