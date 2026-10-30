# 美業核對收款視窗自行關閉修正

接續 PR #1473（正式版 `378c540fa4035d789a1bef93ef79c811e13afec8`），本次 [PR #1474](https://github.com/rock7652-beep/steamfoot-booking/pull/1474)。應用驗收 commit `11fe1f29798c7cbc390c675081e0d2dc97b77267`；後續驗收器與證據提交不改應用版本。

[修正版隔離 Preview](https://steamfoot-booking-ay7ujm4ld-rock7652-2111s-projects.vercel.app)，部署 `dpl_54EpKGpRUm5MF9UqFwfPpP4LCoLS`，READY、非 production。本次未合併 main，未部署正式站。

## 根因與修正

班表以獨立讀取更新日期和網址，未發動整頁 RSC 導航。稍後核對金額／恢復狀態的 Server Action 回傳 RSC，頁面 key 包含日期／月份／班表模式，便重建 BeautyDashboard，清空原本開啟的名單與收款視窗。

工作區現在只按門市、tab、顧客與操作入口等必要邊界隔離，班表座標不再重建整個工作區；明確 bookingId 導航另關閉舊財務對象，晚到報價不能重開舊視窗。金額與狀態查詢改走唯讀 `/api/beauty/collection-read`，不觸發 Next Action 的 RSC 回傳；HTTP 禁止快取，沿用既有權限、門市、預約可見性、資格與交易鎖核對。實際收款、撤銷、核銷與復原寫入不改。

共用收款面板涵蓋班表名單及顧客單次／體驗入口；後者保留原有外層骨架。未修改原價、優惠、方案額度、付款與會計規則。

## 重現與驗證

舊版 Preview `dpl_BeoYCg6xUHGvKrYCzvbWcKxtKPj8`，應用 `bc51a949ad9b04688f18bcfeb40a54dfbac4f9a1`：正常登入隔離美業店，先開 10/30、用日期控制項切到 10/27、切日表並開 QA 體驗預約，再按核對收款。視窗 60ms 出現，8 秒後未操作便消失。[before.json](beauty-collection-autoclose-20261030/before.json) 記錄兩個 readonly Next Action，沒有提交收款。這是隔離合成資料的實際瀏覽器重現，並非使用者正式 session 的錄影。

修正版以相同操作順序正常登入，12 項 hosted 檢查通過，詳見 [after.json](beauty-collection-autoclose-20261030/after.json)：

- 殼層 48ms 顯示；刻意保留金額請求 5 秒，視窗持續顯示。此為控制延遲測試，48ms 是單次觀察值，不是服務效能保證。
- 金額／狀態回來後保留同一 DOM 視窗；兩個查詢均為獨立 HTTP，沒有 Next Action。
- 關閉不導航、不寫入，原名單 DOM 保留；重開仍正常。
- 模擬金額讀取 503，錯誤保留在視窗內，重新讀取恢復；錯店讀取拒絕。
- 桌機 1366×900、iPad 橫向 1024×768、直向 768×1024：視窗在邊界內，頁面沒有水平溢出。僅雲端 Chromium 模擬尺寸，非實體 iPad／Safari。

12 個本地測試檔共 84 項通過（收款、原授權、scope、復原、名單、單次入口、Preview 隔離）；TypeScript、變更檔 ESLint 及驗收器 ESLint 通過。新增實際 BeautyDashboard 日期 key 回傳前失敗、修正後保留視窗及未提交備註的回歸案例；明確切換預約仍隔離且忽略晚到回應。未送出真實或合成收款，完整結帳交易不是本次 hosted 驗收範圍。

截圖：[桌機](beauty-collection-autoclose-20261030/collection-1366.png)、[iPad 橫向](beauty-collection-autoclose-20261030/collection-1024.png)、[iPad 直向](beauty-collection-autoclose-20261030/collection-768.png)。

## 隔離與限制

只使用既有 `steamfoot-preview`（`ttworfzgwejdeolegkxl`）的 `beauty-hosted-20261021`、QA1469 暫時帳號及既有 `qa1469-collection-shell-booking`，未更動其他店／正式業務資料。既有測試預約維持 RESERVED、debit=false、revision=6、付款 0 筆、AUDIT 優惠 1 筆；驗收後停用暫時帳號、清除密碼並停用其 Staff。運動與音樂帳號未重新啟用。

建置沿用精確分支＋repository＋兩條隔離連線的 fail-closed Preview 保護，無 migration、通知保持停發、正式環境變數未改。Cloudflare Workers Builds 外部檢查失敗保留原狀；目前此入口與目標部署在 Vercel，沒有 Worker 路由／設定變更，故不是本次 UI 修正的必要依賴，不宣稱該檢查通過。

正式舒生活店、HQ ADMIN 切店及實體 iPad 尚未驗收；正式紀錄中的單次 collection.read 為 338.4ms，只能證明該讀取成功，不足以還原實際使用者關閉事件。

重跑：`scripts/qa/beauty-collection-autoclose-browser.mjs`，使用 `QA_URL`、`QA_OUT`、`BEAUTY_AUTOCLOSE_ENV_DIR`、`BEAUTY_AUTOCLOSE_LOGIN_FILE`；舊版重現加 `QA_BASELINE=1`。需要獲准且已啟用的唯一隔離店登入檔及有效 Preview 保護身分；驗收器不偽造 session，不自動建立 fixture，不送出收款。測試憑證不入庫。
