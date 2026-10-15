# SPA 模組移除紀錄

## 2026-10-15 歷史資料入口修正

- SPA `module`／`theme` 查詢封鎖限縮至 header／schedule／panel 三個預覽入口；HQ 歷史操作紀錄保留 `module=SPA` 篩選及原有登入、權限與資料範圍檢查。
- 店舖普通網址（登入、註冊、預約、LIFF、共用後台）、指定店舖的後台登入，以及 HQ 已選 SPA 店舖的共用後台，在 Proxy 以權威門市模組資料攔截，回應不含門市資料的 410 停用頁。HQ 停用選擇會清除，避免返回總部時重複進入失效店舖。一般店舖與找不到店舖的請求仍沿用既有授權／404 流程。
- HQ 店舖列表不再提供 SPA 功能設定操作；詳情保留歷史摘要，移除前後台業務連結及營運狀態修改。功能設定深層網址僅顯示停用通知與歷史紀錄連結，不載入編輯器；直接修改功能覆寫、數位管家啟停及營運狀態亦由後端拒絕。
- 原 `getStoreIndustryModule` 的業務授權禁止規則維持；不刪除資料、不執行 migration、不將 SPA 誤轉為蒸足。
- 隔離 UI Preview 僅允許本次精確分支 `codex/fix-spa-history-access-20261015`，仍禁用資料庫、通知與寫入。`/spa-retirement-preview?view=retired` 使用實際 410 文件；`?view=history` 使用實際 HQ 停用設定元件與合成門市 ID，不代表已查驗正式歷史店舖。
- 本機響應式腳本 `scripts/qa/spa-history-browser.mjs`：停用頁與 HQ 停用設定元件於 360、390、768、1024、1366、1920 px 六種寬度完成 12 項檢查，無整頁水平溢出、無可修改表單、返回連結可鍵盤到達且觸控高度至少 44px。
- 本機全套 Vitest：1,072 個測試檔通過、10,430 項測試通過，另 16 檔／129 項跳過；新增 HQ 設定深層入口測試另通過 2 項。
- 限制：HQ 使用合成資料及側欄占位；未登入真實歷史店舖、未驗證正式歷史紀錄內容、未測 Safari／實體 iPad，不宣稱完整業務驗收。遠端 CI、Preview URL 與最終提交以後續修正 PR 為準。

日期：2026-10-14

目前保留時段模組（蒸足）、運動教室與音樂教室；兩種教室沿用 COURSE 引擎及各自的業務設定。

## 變更

- 官網移除 SPA／服務預約卡片與介紹頁；申請表僅保留上述三種業務，網站地圖不再列出 SPA 介紹。
- HQ 新店表單移除 SPA 選項，後端拒絕 SPA 建店、佈建與啟用；已有完整設定的 SPA 門市同樣不能重新啟用。
- 可用模組登錄移除 SPA，保留舊 SPA 識別值以避免歷史門市被誤判為蒸足。
- SPA 專用手機登入移除；舊預覽、SPA 排程、人員、資源、設定儲存、LIFF 工作、匯出及提醒排程網址回應 410。直接呼叫業務操作仍受後端模組授權檢查。
- 移除兩個 SPA demo seed 的 npm 入口。
- HQ 歷史門市資料保留，顯示 SPA 已移除；不執行資料刪除或 schema migration。SPA schema、相容型別與舊程式碼保留封存，不再註冊為可用模組。

## 驗證

- 14 個測試檔、219 項測試通過：模組登錄／授權、退休網址、蒸足／音樂／運動建店、官網路由／SEO、舊 SPA 工作入口。
- TypeScript `tsc --noEmit` 通過；本次變更的應用程式檔案 ESLint 與 `git diff --check` 通過。
- 官網卡片與 HQ 開店表單以無資料庫 fixture 驗證：390×844、768×1024、1024×768、1366×900、1920×1080，10 組結果皆通過，無整頁水平溢出、無瀏覽器執行錯誤；HQ 三種模組可依序選取。
- 瀏覽器腳本：`scripts/qa/spa-retirement-browser.mjs`。使用外部 Playwright 時，以 `QA_PLAYWRIGHT_MODULE` 指定套件位置；`QA_CHROMIUM_EXECUTABLE` 指定 Chromium。
- 預覽涵蓋真實元件及 CSS，Server Action 明確替換為禁止提交的 fixture。未登入真實 HQ、未呼叫正式 API／資料庫，未進行完整業務或 Safari／實體 iPad 驗收。
- 尚未合併或部署正式站。

## 發布前狀態

- 草稿 PR：#1333（codex/remove-spa-module-20261014），已同步 main 的 #1332 更新。
- 首輪遠端 CI 的 ESLint 與 Typecheck 通過；測試中的網站地圖數量、SPA 歷史入口／依賴清單與申請表選項預期已修正，並加入 targeted CI。
- Vercel 自動 Preview 在 `ci-migrate.mjs` 的既有分支隔離檢查中停止：`Sports shared-card checkout requires its exact authorized Preview branch and repository metadata.` 尚未產生可驗收的線上 Preview，需先完成此分支的隔離 Preview 配置；未修改這項發布保護。

## 本次授權的隔離 Preview

- 已新增本次精確分支 `codex/remove-spa-module-20261014` 的 Vercel Preview 模式；要求 `VERCEL=1`、`VERCEL_ENV=preview` 與固定 repository metadata，拒絕 Workers／Pages 或任意 guide override。正式 main 不啟用此模式。
- 沿用三個資料库 client 的停用實作；不讀取或替換繼承的連線憑證。ci-migrate 在資料庫工作前退出，LINE／Messenger／Email／HealthFlow 發送受既有邊界阻擋。
- 僅開放官網、三模組介紹、政策／申請表及 `/spa-retirement-preview`；其他 HQ／門市／API 入口被封鎖。POST／Server Action 等寫入為 405，SPA 舊入口為 410。
- 開店預覽共用真實 NewStoreForm，設定 previewOnly 後建立按鈕停用、提交函式直接返回，不新增資料。
- 本機 439 項隔離與路由檢查、ESLint 及完整 `npm run build` 通過；日誌確認 `database_disabled=true migrations_skipped=true`。
- 線上 HTTP 與瀏覽器驗收腳本：`scripts/qa/spa-retirement-deployment.mjs`。實際部署 URL、提交與遠端驗收結果以 PR #1333 更新為準。

- 真實 Next 預覽驗收發現 canonical alias 與 rewrite destination 的迴圈；本次精確預覽模式直接提供核准的 rewrite destination，避免官網／申請表及政策頁互相轉址。正式模式的路由維持原設定。
