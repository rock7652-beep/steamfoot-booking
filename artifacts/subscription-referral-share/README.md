# LINE 推薦連結完整網址修正

使用者回報分享文字只顯示 `/apply?ref=SB-TESTABCD`。QA 的相對網址在複製入口會補 origin，LINE 入口卻直接使用相對字串。先前剪貼簿驗證沒有涵蓋 LINE 文字，本輪補上兩個入口同址的回歸。

應用來源 `9beba3298dadd1be2dbb8050450c4fdab17269f4`，PR #1514。已驗證的 QA 伺服器用 Vercel 部署 origin 產生完整 HTTPS 連結；正式環境預設 `https://www.steamfoot.com`。畫面文字、剪貼簿及 LINE text 參數共用同一字串，SSR 已包含正確完整網址，不用等使用者點擊才補網址。拒絕非HTTPS、帶認證、路徑或query的設定origin。

本機26項相關測試、受影響檔案ESLint及完整TypeScript通過。範圍為店家「我的推薦」的可見連結、複製及LINE分享；官網申請、推薦碼及獎勵交易未更動，沒有資料庫或權限變更，不重置使用者正在測試的案例。

部署 `dpl_7RhTmyDwKmD9sWfmAAZgXTiJciWp` 已 READY，來源為上述9beba329。CI [41990419783](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41990419783) 的 Targeted tests、ESLint、Typecheck、Full Vitest baseline 全部成功。

`browser.json` 記錄真實推薦人帳號登入，畫面完整網址與 LINE text 參數完全相同；實際系統剪貼簿亦相同。另開申請頁面，推薦碼正確帶入、確認框仍預設未勾選。390／768／1366寬的三張實際頁面截圖無水平溢出，無pageerror。沒有提交申請或發獎，不重置現有測試進度。

測試版仍保留 Deployment Protection 與申請表原有HQ測試限制；此完整網址修正不表示匿名朋友已可直接在隔離環境送出正式申請。部署來源固定9beba329，後續只同步文件與合成驗收證據，不重建相同應用。分享token與密碼不提交。

不透過工具發送LINE訊息；LINE手機客戶端是否產生預覽卡不是此回歸的驗收宣稱。
