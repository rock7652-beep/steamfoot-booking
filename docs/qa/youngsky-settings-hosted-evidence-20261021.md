# YoungSky 銀行儲存 console／網路證據與預覽補驗

2026-10-21，Asia/Taipei。此報告只適用隔離 Vercel Preview，不是正式站耗時。

- SHA：`b3bc95c0e5d658621407ac87ec8830fa0fd7456c`
- Deployment：`dpl_Aeu84Pf2tehBfWWYUW3p8PLaPNgs`
- 預覽：https://steamfoot-booking-mfayhyzi2-rock7652-2111s-projects.vercel.app
- 合成店：`sports-live-flow-store`／`sports-live-flow`。新建僅綁此店的暫用 OWNER，以真實登入測試；結束後 User SUSPENDED、Staff INACTIVE，passwordHash 已移除。既有使用者及正式資料未變更。

## 對齊同一次請求的證據

所有下列請求皆 HTTP 200、success=true、syncWarning=false。各 trace ID 已同時對齊 HTTP X-Settings-Trace、Server-Timing 及 Vercel runtime log，不以 toast 代替儲存證據。

| 設定 | 操作 | HTTP ms | 後端 handler ms | submit→收合 ms | trace ID |
| --- | --- | ---: | ---: | ---: | --- |
| 銀行名稱 | 修改 | 924 | 229.4 | 944 | 81ba32f8-0e92-42b3-9b47-667492ee19e4 |
| 銀行名稱 | 還原 | 941 | 188.6 | 958 | 5a720c9f-48f9-4c7c-a218-f1e5632ed631 |
| 預約截止規則 | 修改 | 803 | 166.1 | 817 | f5db181b-ee4d-4309-8869-95630b9503a9 |
| 預約截止規則 | 還原 | 972 | 159.6 | 1015 | 423942b1-f22f-4c18-98ac-c34c59bbfbeb |

HTTP 取 Playwright requestStart→responseEnd，先 await response.finished()，避免未完成回覆的負值。submit→收合由頁面內 submit listener 與 MutationObserver 量測，和另含驅動／250ms穩定等待的 clickToVerifiedMs 分開。handler 的巢狀 spans 不相加；HTTP 減 handler 包含網路、proxy、平台等，不全歸因資料庫。

## Console、回讀與還原

兩輪可控 Chromium 都未捕捉到 pageerror／console.error。原先 TinyFish 的成功 toast＋錯誤畫面保留為異常觀察：該筆後端499.3ms且資料庫確實寫入，不能聲稱回滾。該值已條件式還原；新兩輪同版預覽均無重現。不將工具先前「欄位空白所以未寫入」或「所有修改按鈕開錯」當根因，也未據此變更業務程式。原使用者身分的完整 console stack 仍未取得；不能宣稱該一次錯誤已定位或修復。

銀行名稱空值→合成銀行名→空值；截止規則0分鐘→60分鐘→0分鐘；每次確認成功收合、重開回讀、最後重新導頁回讀。與先前三種設定的紀錄合計，五種設定的成功保存／收合／回讀／還原已有登入後證據。

資料庫最終核對：店名為原「運動流程隔離驗收店」；銀行名稱／代號／帳號均null；bookingLeadMinutes=0、cancellationLeadMinutes=0、體驗499、候補2、selfLeaveEnabled=true、dutySchedulingEnabled=false。

## 指定尺寸

實際 viewport 1366×900、1920×1080、1024×768、768×1024 均量測通過：documentElement.scrollWidth 等於 innerWidth，沒有整頁水平溢出；改變尺寸後銀行草稿保留，儲存按鈕可見。四張截圖已逐一視覺檢查。截圖為 fullPage，部分高度大於 viewport；不代表測試裝置尺寸錯誤，也不宣稱免垂直捲動。這是 Chromium viewport，未測 Safari／實體 iPad。尺寸草稿從未送出。

## 證據檔

- `results.json`：有效 HTTP、UI 計時、console/page errors 與尺寸斷言。
- `matched-server-traces.json`：逐筆對上的後端計時與 trace。
- `report.html`：自包含圖文證據，可離線開啟。
- `first-run-incomplete-http-timing.json`：首輪功能／尺寸通過，但前三筆HTTP在response完成前採樣出現負值，**不得用作耗時結論**。
- `scripts/qa/youngsky-settings-hosted-browser.mjs`：可重現的限定host／合成store驗收；執行需另行準備短效存取與暫用帳密，這些值不包含在repo或報告。

## 發布安排

PR #1383 維持 Draft，未合併或發布。這輪沒有新增效能或業務修正，只有驗收腳本／證據。未重現端到端儲存>3秒，依使用者條件不擴大優化。發布前仍須核對當時main與正式環境、檢查Workers Builds失敗是否為必要門檻、確定原錯誤是否需要補原身分stack；若整合main或修改程式，須以新的精確SHA重跑相關預覽，不拿本報告代替。實際發布需另行安排，回退以發布前正式deployment為準。

發布準備唯讀核對：PR維持Draft，head=b3bc95c0。main=7980aa9049a471e91442e2bf5abf1843ca23d8ea，分支ahead2／behind8；不得把這次預覽驗收套用到尚未整合的版本。
