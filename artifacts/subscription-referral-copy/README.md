# 已核准的 LINE 分享誘因文案

使用者確認訊息以「🎁 用我的推薦連結申請蒸管家，你和我都能額外獲得30天免費使用」引導，接續預約／收款／顧客管理效益、完整申請連結及首次付費開通滿30天且未退款、核對後發放的條件。分享訊息保留段落及emoji，移除不適用LINE純文字的Markdown粗體符號。複製連結按鈕仍只複製網址。

應用來源 `12c3e8a26aa357f86fd3c583bb8e6fda20ab5eb8`；Vercel隔離部署 `dpl_DZuKDBS2oKKDyiSBaxnf7KdjHNJr` 已READY。CI [41994266050](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41994266050) 的 Targeted tests、ESLint、Typecheck、Full Vitest baseline 全部成功。本機既有分享回歸6項、受影響檔案ESLint、完整TypeScript通過。

`browser.json` 記錄實際推薦人密碼登入後，讀取LINE分享href並解碼，比對每個字與換行均符合核准文案，完整連結保持測試站內且帶原推薦碼；另開該連結實際到達申請表，推薦碼正確帶入、確認框預設未勾選，無pageerror。未發送LINE訊息、未送出申請或發獎、不重置既有案例。

此次只變更不可見的分享href內容，頁面可見DOM與排版沿用前一輪完整網址修正；該輪390／768／1366寬的實際截圖與剪貼簿驗證見 ../subscription-referral-share/。本輪另以390寬正常登入驗證入口，不宣稱手機LINE客戶端實際傳送或新增實體裝置驗收。

正式入口設計為官網 `/apply?ref=...` 的店家需求／體驗申請表，推薦碼自動帶入。隔離測試站仍有Vercel保護與HQ申請限制，不能作為對外公開推薦入口；正式活動仍關閉、正式站未合併／發布。沒有修改資料庫、權限、扣款或通知。部署及CI來源固定上述12c3e8a2；其後文件／證據同步不重建相同應用。登入密碼與分享token不提交。
