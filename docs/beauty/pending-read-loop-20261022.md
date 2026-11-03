# 技師待處理循環讀取修正

2026-10-22；隔離支線 preview/beauty-ui-alignment-20261021。

部署來源 b99a3e11d3df78100772d8d2fa7ee8ba150c9b70，Preview dpl_FkpfqUvyuvyh3kFaW7iHCcYsF5Hn，READY。
入口：https://steamfoot-booking-dlsoa3mqo-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/

## 問題與修正

舊版停留待處理約 9 秒產生 11 次 Server Action POST，讀取結果更新 RSC readVersion，scope 變動再次讀取，造成清單與讀取中反覆切換。此次重現的是頁面閃動，未重現瀏覽器程序退出。

改由同源、private/no-store GET 讀取紀錄、方案歷程及本人收入；沿用原有後端 session、店家、功能及本人資料授權。讀取不刷新整頁。保留明確錯誤及手動重試，15 秒逾時。移除技師非預約狀態的「更正回預約」與空的更多入口；店長更正流程不變。

## 驗證

- 71 個測試檔案、525 項測試通過；TypeScript、ESLint、diff check 通過，hosted build READY。
- 真實登入技師，歷史紀錄與待處理各讀一次後停留 35 秒，請求數維持 2，沒有 loading 閃動，紀錄讀取沒有 Server Action POST。
- 歷史／待處理來回三輪，每次只有操作對應的 GET，停止操作後沒有追加讀取。
- 完成卡片沒有更正回預約；收入及顧客本人方案帳本讀取完成。
- 匿名、一般顧客讀技師紀錄、錯誤店家均拒絕，回應 private/no-store。
- Chromium 360、390、768、1024 寬度無整頁橫向溢出，沒有 pageerror。
- 本次沒有 migration、環境設定或業務交易資料變更；LINE 維持關閉，正式站未變更。

原始取樣與截圖見 evidence/pending-read-loop-20261022。實體 iPhone Safari 的停留／切換仍請店家確認；目前技師待處理清單為空，有資料及失敗重試情境另由元件測試涵蓋。
