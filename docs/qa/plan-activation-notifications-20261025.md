# 全站方案開通 LINE 通知

日期：2026-10-25（Asia/Taipei）。開發支線：`feat/plan-activation-line-notification`。

## 行為與入口

- 蒸足、運動、音樂：設定 → 提醒管理 → 顧客提醒 → 方案提醒 → 方案開通通知。
- 美業：設定 → 提醒管理 → 顧客提醒的方案開通通知，與既有方案餘額／到期提醒並列。
- 共用即時開關、pending guard、就地錯誤、唯讀狀態及預設收合的訊息預覽；沒有自訂數值或草稿表單。
- 依使用者最新指示，既有及新店均預設開啟；曾手動關閉的店家保留關閉，設定按店家隔離。只通知購買人，不向共用成員群發。未設定時，設定畫面、開通事件與派送前檢查均使用同一個開啟預設，不需批次覆寫門市資料。
- 內容包含門市、購買人、方案、本次開通額度、期限。音樂顯示首堂起算天數，不宣稱已繳清。

## 寫入與派送範圍

| 模組 | 立即開通 | 待核帳 |
| --- | --- | --- |
| 蒸足 | 後台購買、單次預約轉購 | 確認付款並建立方案錢包 |
| 運動／音樂 | 後台購課／續購，含原生與既有入口 | 會員回報轉帳後，店長核帳發卡 |
| 美業 | 共用 issueCard，含原生及既有後台購買 | 核帳後使用同一 issueCard |

事件與方案權益在同筆交易提交，依門市、模組及權益 ID 唯一去重。歷史匯入、紙本移轉、補額度、收舊款及開通前的購買申請不建立開通事件；未重新發卡的歷史待核帳錢包不回補。

請求完成後以 Next `after()` 嘗試派送，已提交購買不受 LINE 故障影響。新增已認證的每五分鐘 cron，沿用專案既有分鐘級排程配置；每輪有限批次及時間預算。發送前檢查店家、功能、原購買／權益、退款／作廢、購買人與 LINE 身分。保留既有美業全域關閉、Preview 外發阻擋及專用資料角色隔離。

關閉時中止尚待處理事件；停用期間與 Preview 開通事件直接記錄略過，重新啟用不掃描舊購買。發送紀錄可篩選「方案開通通知」。LINE 接受不等於收件人已閱讀。

## 重試及資料庫

- 新增 `PlanActivationNotification` outbox，啟用 RLS；既有美業專用角色僅取得 module=BEAUTY 的 SELECT／INSERT／UPDATE，不建立角色、不擴大既有表權限。
- 五分鐘原子 lease 避免 worker 同時處理同一事件；原始訊息本文、路徑與 UUID retry key 在 API 呼叫前持久化。路徑改變停止補送。
- LINE 未明確回應時保留提醒額度 reservation；最多 5 次、23 小時內重試，早於 LINE 24 小時去重期限。
- 若成功紀錄已提交但 outbox 更新失敗，以成功紀錄恢復，避免覆寫或重發。已交付 LINE 的請求無法由後續退款或關閉撤回。
- 需先套用本支線新增 migration，再發布程式。此工作未對正式或共享資料庫執行 migration。

## 驗證

- 11 組 targeted test files，共 122 tests 通過；包含三種來源未儲存設定時預設開啟並成功派送、保留手動關閉、PGlite 實際執行 migration、美業資料角色 RLS、事件 SQL、購買交易回滾、三種來源資料查驗、並行 worker、逾時安全重試、發送中關閉不重新排隊、關閉／Preview 不補發、退款／跨店／封鎖／額度／功能略過，以及設定權限。
- Prisma 三套 client 產生與完整 `tsc --noEmit` 通過。
- Changed-file ESLint 通過（原生瀏覽器腳本的 module 變數名稱已修正）；`git diff --check` 通過。
- `node scripts/qa/plan-activation-browser.mjs`：Chromium 以 1366×900、1920×1080、1024×768、768×1024 與 480×900 視窗中的 360px 窄容器，四模組共 20 組；驗證預設開啟、即時關閉／開啟、預覽收合、錯誤還原、唯讀、resize 保留狀態、無整頁水平溢出及 console error。
- 結果：`artifacts/plan-activation-20261025/results.json`；代表截圖保留於同目錄。這是共用元件的隔離 fixture，所有網路請求均攔截；不等同登入後的完整業務驗收或真機 LINE 送達。

## 發布狀態與限制

主功能已透過 PR #1404 合併，正式資料庫已套用單一新增 migration 與相同 checksum 的 Prisma ledger；正式部署 `dpl_FtBuRcSt5HDtvRSGruisKDKzGhyC` 已 READY，兩個正式網域已指向該版本。正式店家開關採預設開啟的讀取規則，未批次覆寫設定，未建立測試購買或手動發送 LINE。正式收件驗收與 dedicated Beauty worker 連線，需在既有部署規則允許發送的環境下另行核對；本功能不放寬那些環境閘門。Vercel 正式 build、TypeScript、唯讀 pg／Prisma／TLS／RLS gate 通過；CI 廣域 targeted tests 的 14 項失敗已在舊 main 完整重現。非阻擋 Full Vitest baseline 另揭露單元測試新依賴與指南計數問題，已補齊通知 mock，並將通知說明收回既有蒸足／課程提醒與美業方案文章，維持歷史文章 ID／數量。對該次全量失敗的 68 個檔案逐一與舊 main 比對，修正後兩邊同為 58 項既有失敗，新增失敗為 0；未停用或移除任何檢查。結果見 `artifacts/plan-activation-20261025/release-checks.json`。不宣稱全站 CI 全綠。
