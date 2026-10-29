# 會員方案同步與隔離驗收：待實作項目

## 已核實的現況

- 美業會員方案畫面目前使用授權快照輪詢，最近出現的待核帳單在 60 秒內每 2 秒查詢，其後每 10 秒查詢；沒有跨裝置推播。
- 既有 `steamfoot-preview` 是共用測試資料庫，不能當成僅供購買意圖 migration 及破壞性併發測試使用的隔離資料庫。查詢時該專案沒有開發分支。
- 既有驗收用 Beauty Preview 的購買意圖旗標維持關閉；本機 PostgreSQL 測試使用 Prisma schema 產生新庫，未驗證由既有歷史 schema 升級。
- 專案目前以 Auth.js 驗證會員；不能假設其 session 是 Supabase JWT，亦不可使用公開頻道或在事件中包含會員、交易或餘額資料。

## 即時同步的驗收設計（尚未實作）

1. 先確認 Supabase Realtime 與 Auth.js 的安全身分橋接可行：短效憑證只授予經伺服器確認的會員及門市所屬私有主題；主題授權、憑證換發、登出或停權後的失效時間都要測試。客戶端不可持有 service role 或 JWT 簽署密鑰。
2. 核帳、作廢、退款、扣次及恢復等任何影響會員快照的變動，只在交易成功後發送無個資的失效提示。推播不可決定帳務狀態，接收後仍透過現有授權快照重新讀取；發送失敗不可導致已提交交易重複或回報失敗。需設計可靠投遞或保留輪詢補償。
3. 訂閱與初次讀取之間、讀取期間有新事件、重連、背景恢復與身分切換均要避免漏更新或顯示跨會員舊資料；限制同時請求並合併連續事件。
4. 隔離環境雙裝置實測提交到會員顯示的延遲分布及資料庫負載，並涵蓋拒絕跨店／跨會員訂閱、斷線與權限失效；LIFF／Safari、桌機與 iPad 的適用入口另行驗收。先測量，再決定是否可減少輪詢。

參考：[Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)、[Broadcast](https://supabase.com/docs/guides/realtime/broadcast)。

## 獨立資料庫建置及上線前置（尚未建立）

1. 可從既有 Preview 專案建立 Supabase 開發分支；其提供獨立 project ref，文件說明分支不複製正式資料，但會套用來源 migration，並可能有額外費用。建立前要確認費用及生命週期，不能把共用庫當隔離庫。
2. 先盤點來源 migration 歷史與目前 Prisma schema 的差異，在新庫核實表結構和約束；只在確認基線後套用購買意圖 migration。不得對共用或正式資料庫套用測試 migration。
3. 配置專屬 Preview 分支及新庫連線，沿用 `src/lib/beauty/isolated-purchase-config.mjs` 的來源固定 project ref 與 fail-closed 檢查，啟用旗標前驗證兩條 DB 連線皆為新庫、通知關閉、資料為合成測試資料；密鑰只經安全的環境設定供應。
4. 進行防重、取消、晚到請求、重整、不同入口、六次購買、帳務核對及跨裝置測試。完成後停用測試帳號、撤銷暫時存取並依確認的保留政策處理資料庫；正式部署另依既有授權流程。

參考：[Working with branches](https://supabase.com/docs/guides/deployment/branching/working-with-branches)。
