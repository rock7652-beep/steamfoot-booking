# PR #1465 顧客 LINE 管理驗證

接續原分支 `fix/customer-line-binding-management-20261029`，不另開 PR、不合併正式站。

## 最終行為

- 顧客 drawer 的「⋯ 管理」使用既有 panel reader 與受控重新綁定流程；刪除只有說明的新控制元件，避免兩份 LINE 狀態及 UI 測試載入真實 NextAuth。
- 同頁輸入核對原因、建立 15 分鐘申請、等待本人 LINE webhook 捕捉、安全檢查、輸入確認文字後執行。後端重新查核，不接受前端 READY 作為授權。
- 取消綁定需同頁確認；Serializable 交易依 request → customer 鎖順序同步清除目標 Customer LINE 欄位與本店 LINE CustomerIdentityLink，撤銷待用申請並清除候選密文，寫入稽核。Google、其他顧客、跨店關聯及預約／方案／消費不修改。
- OWNER／ADMIN 仍須 `customer.identity.rebind`、正常 session／訂閱寫入保護及 `assertStoreAccess`。門市 Owner 不取得跨店權限；真正 HQ ADMIN 保留既有合法跨店能力，HQ 店家視角維持該店限制。
- 重新綁定會修改全域 Account，因此其他顧客或門市共用中央登入身分時，安全檢查與交易均拒絕，保留原資料並交由另行核對；不悄悄修改其他顧客登入。
- 未綁定時產生的 Messaging 綁定碼僅限 OWNER／ADMIN，一次性兌換、24 小時到期、compare-and-set、交易衝突拒絕。Messaging 身分不建立或取代 LINE Login 身分。

## 安全隔離 Preview

使用原 `steamfoot-booking` 專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`、原 team；分支明確登記在既有安全 gate。

依原 gate 核對 Preview 目標、原 repository metadata、既有 `steamfoot-preview` 隔離連線（兩個 URL 都必須符合，禁止 host／schema 覆寫）、通知抑制；拒絕 Cloudflare provenance。本次 review 使用既有無 migration 模式，沒有移除檢查、修改正式資料或執行 pending migration。未變更 Cloudflare 設定。

`96959891` 已在原專案完成 READY Preview：
https://steamfoot-booking-82s55w5kr-rock7652-2111s-projects.vercel.app

未登入請求回傳 302，內容為 `Protected by Vercel Authentication`。未建立分享／bypass 連結、未關閉保護。最終修訂的部署狀態另列 PR 驗證紀錄。

## 已完成的自動驗證

- 指定的 `customer-note-pending-preview.test.ts` 與 `trial-plan-entry-ui.test.ts`：18 項通過。
- UI 操作測試：實際呼叫建立申請、安全檢查、執行、取消綁定的 mock boundary；確認前不寫入、同 tick 去重、錯誤重試、換顧客草稿隔離、無權限不提供操作。
- PGlite 交易測試：只改 A、保留 B／跨店 C 及 Google；保留所有合成預約／方案／消費；稽核末端故障全部回滾；跨店錯誤輸入零變更。此測試使用最小 PostgreSQL schema 與 Prisma 模型 adapter，不等同真實 Prisma／遠端資料庫端到端驗收。
- 後端測試：OWNER／ADMIN、其他角色拒絕、缺權限、跨店拒絕、已合併／不存在顧客、候選衝突、全域 Account 共用、狀態改變與交易失敗。
- Preview gate 測試：合法原分支放行；production、缺少 metadata、錯誤 repository、錯誤或覆寫連線、Cloudflare 一律拒絕。
- 全量測試初輪：14,219 passed、1 timeout、182 skipped；該既有 PGlite 測試單獨重跑 27/27 通過。以 15 秒 timeout 完整重跑：1,468 個測試檔通過、21 個跳過；14,223 項通過、182 項跳過，沒有失敗。所有業務與安全斷言保留。其後新增的一次性綁定碼與 webhook 修改另經 190 項相關測試驗證。

## RWD 元件驗收

影響入口：共用顧客 drawer 及 legacy 顧客詳情的 LINE 區塊。以下證據僅驗共用 LINE 元件，未涵蓋各模組真實登入後頁面。

使用實際 React 元件、Tailwind 樣式與合成 Server Action boundary，以 headless Chromium 模擬：1366×900、1920×1080、1024×768、768×1024、560×800、390×844、360×800。

七組全部通過：無整頁水平溢出、可見按鈕至少 44×44、展開／輸入／安全檢查／確認／執行／解除／產生碼可操作、resize 草稿保留、無 pageerror。人工檢視 360px 與 iPad 截圖。

- [尺寸與控制量測](component-rwd.json)
- [手機確認畫面](mobile-confirm.png)
- [iPad 確認畫面](ipad-confirm.png)
- 重現：`node scripts/qa/customer-line-management-browser.mjs`，輸出預設 `/tmp/pr1465-rwd`。

## 視覺回歸補驗

重複區塊已以唯一 React key 修復，最新 Preview 操作／尺寸證據與資源載入限制見 [key 修正驗證](key-fix/README.md)。使用者確認沒有獨立測試 OA，真實 LINE 維持未驗。

## 登入後補驗

正常 Vercel 登入、OWNER／ADMIN 取消、STAFF／跨店後端拒絕、遠端記錄完整列比對與實際 Preview 七組尺寸幾何／觸達驗證已完成，詳見 [登入後驗證與剩餘限制](hosted/README.md)。以下為前次驗證時的阻礙紀錄；以該補驗文件為最新狀態。

## 前次未驗紀錄（已由補驗文件更新）

- 此環境 Vercel CLI `whoami` 顯示 Logged out，尚無正常 OIDC／SSO 瀏覽器存取；已要求正常登入方式。未取出或要求任何 token／密碼。
- 未驗隔離 Preview 登入後 OWNER／ADMIN／其他角色實際工作流程、實際 Prisma 遠端寫入前後紀錄數量與取消後 drawer 更新。
- 未使用真正顧客的 LINE 身分完成 webhook 捕捉、bot/profile 安全檢查與重新綁定。沒有偽造驗證成功、關閉通道核對或借用其他門市 LINE 設定。
- 未驗實體 iPad／手機 Safari 或 LINE LIFF；上述為 Chromium 尺寸模擬，不能寫成實機驗收。

維持 PR 開啟；上述登入與實際身分驗證完成前，不合併正式站。
