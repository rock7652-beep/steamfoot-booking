# 原流程 → AI → 真人：隔離 Mock 驗收

2026-11-26（台灣時間），沿用 [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。四個合成店完成同頁路由演練；正式客服與通路尚未開放。[設計契約](digital-butler-routing.md)、[機器可讀證據](../../artifacts/ai-digital-butler/routing/summary.json)、[Runbook](digital-butler-runbook.md)。

## 版本與證據來源

| 範圍 | 程式版本與部署 | 結果 |
| --- | --- | --- |
| 四店完整合成情境、已發布知識 Mock | ec6bb9a8180dbffe9106c9a14fe1a6c6b02d3ca6 / dpl_7VzF2gPcSNC7j6PbJAMFv7BYxHgz | 四店原流程、重送、停用、等待輸入、取消、真人接手、重新載入與明確恢復通過；四店已知問題命中公開來源；美業／運動／音樂未知問題轉真人 |
| 最終修正版 | b25fdaabf882bd6c069c736b59cf428eacf64e56 / dpl_EXj9FubfNcprAPKnsTw2Cmspb3SY | 四店原流程、重送、總停止；15 組尺寸；蒸足帳號跨店拒絕通過 |

[最終受保護 Preview](https://steamfoot-booking-9xboy65y6-rock7652-2111s-projects.vercel.app) READY，SSO 保留。兩版本之間只修正 UNKNOWN 事件同世代阻擋並補測試，UI 與模型程式未變；未為重跑相同 Mock 再產生模型用量。後續純文件提交不重建相同程式。

蒸足本日既有用量已達 20 次，未知問題轉接使用另外三店驗證，未提高限額。原確定性流程在 AI 總停止時仍可演練；只有明確 NO_MATCH 才可進 AI，驗證失敗、處理中或停用都不當成未命中。相同事件重送零模型呼叫；人工接手後原流程與 AI 都沉默，重新載入仍保留，明確恢復才可重新回覆。

## 自動化與介面

- 最終程式：116 個相關測試、4 個真實 PostgreSQL 隔離測試、TypeScript 與變更檔案 ESLint 通過。PG rehearsal 使用本機無網路容器與 Unix socket，未接正式 DB。
- [最終 GitHub CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45737286909) 四項工作皆通過；完整套件 1854 檔通過／36 檔跳過，17,518 個測試通過／338 個跳過，526.93 秒。不以先前版本完整測試代替最終版本。
- UNKNOWN 故障回歸先重現「結果未知但對話接手尚未落盤」可被下一事件繞過，修正為 CLAIMED／UNKNOWN 都阻擋同世代事件。單元及真實 PG 測試通過；沒有在雲端注入故障或實際未知 API 費用。手動接手／恢復建立新世代，不釋放未知模型預留。
- 最終 Chromium 尺寸：蒸足 1920／1366／1024／768／390／360；另三店各 1366／1024／768。15 組無水平溢出、選擇狀態隨收合與尺寸變化保留；無頁面例外或 HTTP 失敗。已目視核對 360／768 畫面。這是瀏覽器模擬，未使用實體裝置。
- `*-stopped.json`／`*-mock.json` 來自 ec6；`*-final.json`、`steamfoot-scope.json` 與尺寸圖來自 b25。每次測試延遲含當時網路及登入，非服務效能承諾。

## 資料庫、安全及費用收尾

只對 steamfoot-preview（ttworfzgwejdeolegkxl）安裝 `preview-routing.sql`：對話 revision 與私有 Dispatch 表，migration 名稱 `ai_preview_routing_receipts_and_handoff_revision`，SHA-256 `bbe670a013f5d3eb7fa96af2592a2c39c6274d7c9f6533f8e8068e68ced70aaa`。六張 AiButler 表皆啟用 RLS；anon／authenticated 沒有表權限，新表 server policy 僅四個合成店。未給 Booking 寫入，未複製正式資料；安全建議掃描未新增這張私有表相關發現，既有建議未擴大處理。

收尾實測 global stopped=true、四店 enabled=false。47 筆模型請求全部 COMPLETE（44 Mock／3 既有 OpenAI），無 RESERVED／UNKNOWN；57 筆路由事件全部 COMPLETE。合成店 Booking／Customer 均 0。本輪僅新增 7 Mock，新增 OpenAI 呼叫 0；累計估算仍為 1310 micros（US$0.001310），不是供應商帳單。

本輪使用兩次既有 Vercel Preview 建置：功能版本與 UNKNOWN 防護修正版，沒有另開專案／PR、購買 IPv4、修改環境憑證或降低 TLS；平台實際帳單尚未取得。Production、Development、其他支線及正式資料庫未修改。真實 LINE／Messenger／Email 外發仍封鎖。

兩部署本輪建立的短期手動通行憑證均已撤銷；四個合成帳號登入版本更新，暫存測試密碼／session 檔刪除；OpenAI Key 未回讀。先前階段臨時連結事件保留於歷史驗收，本輪未輸出通行憑證。

## 邊界與接續

原流程使用實際 CoreDigitalButlerRuntime 演算法，但 repository 是請求內合成 fixture，不讀正式流程、不寫名單、不接真實傳輸。TEST identity codec 以 domain-separated secret 注入；原 runtime 的預設 repository、授權及加密不變。真人狀態持久化在隔離 AI 對話表，尚未接客服工作台。不能把本次演練視為 LINE／Messenger Webhook、原流程持久資料庫或真人通知整合驗收。

既有指南 AI-BUTLER-PREVIEW-01 更新情境／來源，候選 205 題與 96 題待完整教學驗收不變；功能測試不抵扣其他指南待辦。歷史 Cloudflare 建置失敗尚未處理，不是此次 Vercel 驗收依賴。正式通路、實體裝置、資料清理政策、其他模型及 Phase 3 業務工具仍需後續獨立工作；本 PR 維持 Draft，不 promote 正式站。
