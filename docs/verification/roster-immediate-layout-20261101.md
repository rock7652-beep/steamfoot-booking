# 名單先顯示完整版面、背景核對驗收（2026-11-01）

狀態：Draft PR #1479，應用 `d5098faffeb601e8de47bd07df9a1479e1d14c70`，隔離 Preview `dpl_DycpUGHmLpSWeGkEb5Yzf8PiviBQ` READY／hnd1。正式站仍為已完成實際 promote 的 `dbc8844a`；本次改動尚未合併或發布。

使用者要求點開先顯示完整名單介面、背景再補資料。先前只先顯示簡易姓名清單，完整表格與搜尋仍等待讀取；現改用既有名單欄位及各模組樣式，立即顯示教師資訊、可搜尋姓名及已授權身分。手機、用量、餘額、所屬、備註等未知時標示核對中，不推定零、未指定或未留電話。音樂保留既有課程進度欄位；運動與美業沿用共用 CourseRosterList。沒有修改版面字級、方案規則或後端查詢。

搜尋文字由原 scope state 管理，背景資料就緒後保留文字、焦點及游標。即使讀取失敗，也保留目前課堂的已知身分與版面，提供原地重試。最新當次 detail 成功前，點名、扣堂、收款與備註修改仍不提供；沒有新增財務快取或把 snapshot 當交易依據。原 TTL 0、晚到回應隔離及後端檢查保留。

## 正常網路量測

正常 OWNER 帳密登入，沒有 auth mock 或 response mock。三個隔離合成店，各 1 次 warmup＋3 次正式樣本。從實際 DOM click 到預覽／完整控件可見，分別逐幀觀察。

| 模組 | 完整預覽＋搜尋中位 ms | 非 warmup 預覽範圍 ms | 最新資料可操作中位 ms | 首次預覽／最新資料 ms |
| --- | ---: | ---: | ---: | ---: |
| 運動 | 31 | 26–40 | 1053 | 43／3036 |
| 音樂 | 30 | 26–31 | 1032 | 39／970 |
| 美業 | 71 | 59–78 | 1013 | 351／1579 |

預覽數字不代表財務資料已回來，不能宣稱完整權威名單低於一秒。雲端 Chromium 經既有代理，並非台灣裝置、正式銀百合 RUM、p95、大量學員或實體 iPad/Safari。

12 次自然名單讀取的完整 JSON.data SHA-256 與前輪三個場景各自相同，沒有靠刪除欄位換取速度。量測器增加 data-roster-ready=true 控件判斷；新的預覽搜尋欄不可被計為權威資料完成。歷史 benchmark 必須配合其被測版本執行。

## 瀏覽器操作及 RWD

三模組各驗 1366×900、1024×768、768×1024、390×844。控制組透過 Playwright route.fetch 取得真實正常 HTTP 回應，再延後 2000ms 交付；未修改 payload。這段延遲只為驗證等待期間可搜尋，完全排除在自然速度統計外。12 組檢查均確認：完整預覽與搜尋可見、交易按鈕尚未開放，輸入查詢及移動游標後回應才到，搜尋值／焦點／游標仍保留，開啟名單沒有新增整頁文件導覽，對話框在視窗內。音樂表格沿用既有區塊內橫向捲動，手機頁首操作亦沿用既有局部捲動。加 3 組正常登入，共 15 項通過，pageerror 0。已視覺檢查手機運動／美業及 iPad 橫向音樂截圖。原始圖片只保留工作區，不提交合成姓名與電話圖片到 repo。

Preview HTML 沒有提供 production 的 data-dpl-id；最初驗收器因此斷言失敗，未宣稱那次通過。改以唯一部署 hostname 加 Vercel deployment API 的來源 SHA／ID 核對；HTML 若提供 deploymentId 仍要求相符，並確認本次新增預覽及 ready 控件存在。初次失敗保留在 JSON，正式網域驗收仍需獨立核對 alias mapping 及 HTML／asset deploymentId，不得只比 script 檔名。

## 回歸與清理

4 檔／79 項局部回歸通過；首次失敗後原地重試、搜尋與焦點連續、未知電話不誤稱未留、寫入控件核對前禁用均有測試。最新 [CI 41260565621](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41260565621) Typecheck、Changed-file ESLint、Targeted、Full Vitest 全部成功，1574 檔／15051 項通過，30 檔／257 項 skip。

本次沒有送出排課、點名、扣堂、收款或其他業務 mutation。測前後限定三個測試店：CoursePurchase 125、CoursePointEntry 933、CourseBooking 621、BeautyPayment 90、BeautyLedger 126 一致；計數不能替代逐列帳務驗收。三個 QA User SUSPENDED 且 passwordHash NULL，三個 Staff INACTIVE；私密帳密／連結輸入檔刪除。

新存取連結原先被自動批准審查拒絕，原因是無法確認連結上限；並未改走其他保護繞過方式。用聊天中原建立結果的精確 secret 撤銷舊 link，取得成功回覆後，才建立最終候選一個 23 小時連結，仍維持最多兩個隔離部署，應用正常登入保留。沒有修改正式設定、DNS、通知狀態或 migration。

[逐次結果及初次驗收器失敗](roster-immediate-layout-20261101.json)，驗收器：scripts/qa/roster-immediate-layout-browser.mjs。輸入只讀取 chmod-600 的臨時 JSON；報告不含密碼、存取 secret、名單 body 或真人個資。
